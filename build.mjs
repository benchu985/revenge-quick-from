import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import { createHash } from "crypto";
import { rollup } from "rollup";
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import esbuild from "rollup-plugin-esbuild";

const plugins = [
  nodeResolve(),
  commonjs(),
  esbuild({
    minify: true,
    target: "es2018",
    // no tsx needed for createElement style, but keep
    loaders: { ".ts": "ts", ".tsx": "tsx" },
  }),
];

await mkdir("./dist", { recursive: true });

for (const plug of await readdir("./plugins")) {
  const manifest = JSON.parse(
    await readFile(`./plugins/${plug}/manifest.json`, "utf8"),
  );
  const outPath = `./dist/${plug}/index.js`;

  const bundle = await rollup({
    input: `./plugins/${plug}/${manifest.main}`,
    onwarn: () => {},
    plugins,
  });

  await mkdir(`./dist/${plug}`, { recursive: true });
  await bundle.write({
    file: outPath,
    globals(id) {
      if (id.startsWith("@vendetta"))
        return id.substring(1).replace(/\//g, ".");
      if (id === "react") return "window.React";
      return null;
    },
    format: "iife",
    compact: true,
    exports: "named",
    // NO name — must be anonymous IIFE expression
  });
  await bundle.close();

  const js = await readFile(outPath);
  const text = js.toString("utf8");
  if (!text.trimStart().startsWith("(function") && !text.trimStart().startsWith("!function")) {
    console.error("BAD BUNDLE HEAD:", text.slice(0, 80));
    process.exit(1);
  }
  // must end with invokation returning exports
  if (!text.includes("vendetta.")) {
    console.error("Bundle missing vendetta. globals");
    process.exit(1);
  }

  manifest.hash = createHash("sha256").update(js).digest("hex");
  manifest.main = "index.js";
  await writeFile(`./dist/${plug}/manifest.json`, JSON.stringify(manifest));
  console.log("Built", manifest.name, js.length, "bytes hash", manifest.hash.slice(0, 12));
  console.log("HEAD", text.slice(0, 60));
  console.log("TAIL", text.slice(-80));
}
