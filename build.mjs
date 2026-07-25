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
  esbuild({
    minify: true,
    target: "es2019",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    tsconfig: false,
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
      // Vendetta injects these as IIFE globals — must stay external
      external: (id) => id === "react" || id.startsWith("@vendetta"),
    });

    await mkdir(`./dist/${plug}`, { recursive: true });
    await bundle.write({
      file: outPath,
      globals(id) {
        // @vendetta/metro -> vendetta.metro  (same as official plugins)
        if (id.startsWith("@vendetta"))
          return id.substring(1).replace(/\//g, ".");
        if (id === "react") return "window.React";
        return null;
      },
      // IMPORTANT: anonymous IIFE, NO `name`.
      // Vendetta/Revenge eval the file and need the *expression result*
      // `(function(...){...; return exports})(vendetta...)`
      // `var X=function...` makes eval return undefined → start does nothing.
      format: "iife",
      compact: true,
      exports: "named",
    });
    await bundle.close();

    const toHash = await readFile(outPath);
    manifest.hash = createHash("sha256").update(toHash).digest("hex");
    manifest.main = "index.js";
    await writeFile(
      `./dist/${plug}/manifest.json`,
      JSON.stringify(manifest),
    );

    const head = toHash.toString("utf8").slice(0, 20);
    if (!head.startsWith("(function") && !head.startsWith("!function")) {
      console.warn(
        `WARN: ${plug} bundle does not start with (function — Revenge may fail to start it. head=${JSON.stringify(head)}`,
      );
    }

    console.log(
      `Built: ${manifest.name} -> dist/${plug}/ (${toHash.length} bytes) head=${JSON.stringify(head)}`,
    );
  } catch (e) {
    console.error(`Failed to build ${plug}:`, e);
    process.exit(1);
  }
}
