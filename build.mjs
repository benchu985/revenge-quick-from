import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import { createHash } from "crypto";
import { rollup } from "rollup";
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import esbuild from "rollup-plugin-esbuild";

/** @type {import("rollup").InputPluginOption} */
const plugins = [
  nodeResolve(),
  commonjs(),
  // Termux/Android often has no @swc native binding — esbuild alone is enough
  esbuild({
    minify: true,
    target: "es2019",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    tsconfig: false,
    loaders: {
      ".json": "json",
    },
  }),
];

await mkdir("./dist", { recursive: true });

for (const plug of await readdir("./plugins")) {
  const manifest = JSON.parse(
    await readFile(`./plugins/${plug}/manifest.json`, "utf8"),
  );
  const outPath = `./dist/${plug}/index.js`;

  try {
    const bundle = await rollup({
      input: `./plugins/${plug}/${manifest.main}`,
      onwarn: () => {},
      plugins,
      external: (id) => id === "react" || id.startsWith("@vendetta"),
    });

    await mkdir(`./dist/${plug}`, { recursive: true });
    await bundle.write({
      file: outPath,
      globals(id) {
        if (id.startsWith("@vendetta"))
          return id.substring(1).replace(/\//g, ".");
        return { react: "window.React" }[id] || null;
      },
      format: "iife",
      compact: true,
      exports: "named",
      name: plug.replace(/[^a-zA-Z0-9]/g, "_"),
    });
    await bundle.close();

    const toHash = await readFile(outPath);
    manifest.hash = createHash("sha256").update(toHash).digest("hex");
    manifest.main = "index.js";
    await writeFile(
      `./dist/${plug}/manifest.json`,
      JSON.stringify(manifest),
    );

    console.log(`Built: ${manifest.name} -> dist/${plug}/ (${toHash.length} bytes)`);
  } catch (e) {
    console.error(`Failed to build ${plug}:`, e);
    process.exit(1);
  }
}
