#!/usr/bin/env node

/*
 * publish.js
 *
 * Publish Neat EJS versions from EJS latest ones
 */

import axios from "axios";
import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import { env } from "node:process";
import path from "path";
import semver from "semver";
import tar from "tar";

/** Text to add to the top of the README.md */
const about = `\
> **Neat EJS** is a dependency-free distribution of EJS
> with the same core library but without CLI, published
> synchronously with the original EJS package.`;

/** Text to add to the CLI chapter of the README.md */
const aboutCLI = `\
> ⚠️ The CLI was removed from **Neat EJS** to make it a dependency-free
> package, install the full EJS package if you need to use the CLI.`;

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
  console.log("[info] Versions to publish: %s", versions.join(", "));

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
      throw new Error("[error] README.md patch failed");
    }
    await fs.writeFile(`${release}/README.md`, readme, { encoding: "utf8" });

    //
    // Publish as Neat EJS
    //

    console.log("[info] Publish neat-ejs@%s", version);
    const opts = env.NPM_PUBLISH_DRY_RUN ? "--dry-run" : "";
    execSync(`npm publish ${opts}`, { stdio: "inherit", cwd: release });
  }

})();
