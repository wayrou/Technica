import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { sampleDialogueSource } from "../src/data/sampleDialogue";
import { createSampleMap } from "../src/data/sampleMap";
import { createSampleQuest } from "../src/data/sampleQuest";
import { parseDialogueSource } from "../src/utils/dialogueParser";
import {
  buildChaosCoreDialogueBundle,
  buildChaosCoreMapBundle,
  buildChaosCoreQuestBundle,
  createWorkspaceReferenceIndex
} from "../src/utils/chaosCoreExport";

const root = process.cwd();
const outRoot = path.join(root, "examples", "exports", "chaos-core");

async function writeBundle(subdir: string, bundle: { bundleName: string; files: Array<{ name: string; content: string }> }) {
  const bundleDir = path.join(outRoot, subdir);
  await mkdir(bundleDir, { recursive: true });

  for (const file of bundle.files) {
    await writeFile(path.join(bundleDir, file.name), file.content, "utf8");
  }

  const zip = new JSZip();
  bundle.files.forEach((file) => zip.file(file.name, file.content));
  const archive = await zip.generateAsync({ type: "nodebuffer" });
  await writeFile(path.join(outRoot, `${bundle.bundleName}.zip`), archive);
}

async function main() {
  await rm(outRoot, { recursive: true, force: true });
  await mkdir(outRoot, { recursive: true });

  const { document: dialogue } = parseDialogueSource(sampleDialogueSource);
  const quest = createSampleQuest();
  const map = createSampleMap();
  const references = createWorkspaceReferenceIndex({ dialogue, quest, map });

  await writeBundle("dialogue", buildChaosCoreDialogueBundle(dialogue, references));
  await writeBundle("quest", buildChaosCoreQuestBundle(quest, references));
  await writeBundle("map", buildChaosCoreMapBundle(map, references));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
