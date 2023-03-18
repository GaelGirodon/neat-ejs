#!/usr/bin/env node

/*
 * publish.js
 *
 * Publish Neat EJS versions from EJS latest ones
 */

import axios from "axios";
import glob from "glob";
import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import { env, exit } from "node:process";
import path from "path";
import semver from "semver";
import tar from "tar";

(async () => {

  //
  // Check versions to publish
  //

  console.log("[info] Get packages metadata from the registry API")
  const ejs = await axios.get("https://registry.npmjs.org/ejs");
  const neat = await axios.get("https://registry.npmjs.org/neat-ejs", {
    validateStatus: (status) => status < 500
  });
  const versions = [];
  const neatLatest = neat?.data?.["dist-tags"]?.latest;
  if (neatLatest) {
    const from = new Date(neat.data.time[neatLatest]);
    versions.push(...Object.keys(ejs.data.versions)
      .filter(v => !ejs.data.versions[v].deprecated
        && new Date(ejs.data.time[v]) > from
        && semver.valid(semver.coerce(v)) === v));
  } else {
    versions.push(ejs.data["dist-tags"].latest);
  }

  if (versions.length < 1) {
    console.log("[info] Already up-to-date");
    exit(0);
  }

  //
  // Download, patch and publish each version
  //

  console.log("[info] Versions to publish: %s", versions.join(", "));

  // Load the text to add to the top of the README.md
  const about = (await fs.readFile("README.md", { encoding: "utf8" }))
    .match(/<!-- <about> -->(.+)<!-- <\/about> -->/s)[1].trim()
    .replace(/^/mg, "> ").replace(/^> $/mg, ">");

  // Text to add to the CLI chapter of the README.md
  const aboutCLI =
    "> ⚠️ The CLI was removed from **Neat EJS** to make it a dependency-free\n" +
    "> package, install the full EJS package if you need to use the CLI.";

  await fs.mkdir("release", { recursive: true });
  for (const version of versions) {
    //
    // Download and extract the EJS tarball
    //

    console.log("[info] Download and extract ejs@%s tarball", version);
    const tarball = await axios.get(ejs.data.versions[version].dist.tarball,
      { responseType: "arraybuffer" });
    await fs.writeFile("release/ejs.tgz", tarball.data);
    tar.x({ cwd: "release", file: "release/ejs.tgz", sync: true });
    const release = path.join("release", `ejs-v${version}`);
    await fs.rm("release/ejs.tgz");

    //
    // Patch the release
    //

    console.log("[info] Patch ejs@%s release", version);

    // Remove CLI and useless files
    console.log("[info] Remove CLI and useless files");
    for (const f of ["bin/cli.js", "bin/", "jakefile.js", "usage.txt"]) {
      await fs[f.endsWith("/") ? "rmdir" : "rm"](`${release}/${f}`);
    }

    // Patch package.json
    console.log("[info] Patch package.json");
    const packageJson = await fs.readFile(`${release}/package.json`, { encoding: "utf8" });
    const packageJsonPatch = await fs.readFile("patch/package.json", { encoding: "utf8" });
    const outPackageJson = Object.assign(JSON.parse(packageJson), JSON.parse(packageJsonPatch));
    for (const key of ["bin", "jsdelivr", "unpkg", "dependencies", "devDependencies", "scripts"]) {
      if (!(key in outPackageJson)) {
        throw new Error(`[error] Patch aborted, '${key}' key is missing from package.json`);
      }
      delete outPackageJson[key];
    }
    await fs.writeFile(`${release}/package.json`,
      JSON.stringify(outPackageJson, null, 2) + "\n", { encoding: "utf8" });

    // Patch README.md
    console.log("[info] Patch README.md");
    let readme = await fs.readFile(`${release}/README.md`, { encoding: "utf8" });
    readme = readme
      .replace(/^(## )/m, `${about}\n\n$1`)
      .replace(/^(## CLI)/m, `$1\n\n${aboutCLI}`);
    if (!readme.includes(about) || !readme.includes(aboutCLI)) {
      throw new Error("[error] Patch aborted, README.md content changed");
    }
    await fs.writeFile(`${release}/README.md`, readme, { encoding: "utf8" });

    // Check the patched release
    if ((await glob("**/*", { cwd: release })).length !== 8) {
      throw new Error("[error] Patch aborted, expected 8 files in the release");
    }

    //
    // Publish as Neat EJS
    //

    console.log("[info] Publish neat-ejs@%s", version);
    const opts = env.NPM_PUBLISH_DRY_RUN ? "--dry-run" : "";
    execSync(`npm publish ${opts}`, { stdio: "inherit", cwd: release });
  }

})();
