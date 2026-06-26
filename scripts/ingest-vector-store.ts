import "dotenv/config";
import fs from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

const knowledgeDir = path.resolve(process.cwd(), "data/knowledge");
const apiKey = process.env.OPENAI_API_KEY;
const brandName = process.env.BRAND_NAME ?? "Aster & Ridge";

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required to ingest knowledge files.");
}

const openai = new OpenAI({ apiKey });
const configuredVectorStoreId = process.env.OPENAI_VECTOR_STORE_ID?.trim();

const vectorStoreId =
  configuredVectorStoreId && configuredVectorStoreId.startsWith("vs_")
    ? configuredVectorStoreId
    : (
        await openai.vectorStores.create({
          name: `${brandName} brand knowledge`
        })
      ).id;

const files = (await readdir(knowledgeDir))
  .filter((fileName) => /\.(md|txt|json|csv|pdf|docx)$/i.test(fileName))
  .map((fileName) => path.join(knowledgeDir, fileName));

if (!files.length) {
  throw new Error(`No ingestible files found in ${knowledgeDir}`);
}

for (const filePath of files) {
  const fileName = path.basename(filePath);
  const uploaded = await openai.files.create({
    file: fs.createReadStream(filePath),
    purpose: "assistants"
  });

  await openai.vectorStores.files.create(
    vectorStoreId,
    {
      file_id: uploaded.id,
      attributes: {
        source_path: filePath,
        category: inferCategory(fileName),
        title: fileName
      }
    } as never
  );

  console.log(`Attached ${fileName} as ${uploaded.id}`);
}

console.log("");
console.log(`Vector store ready: ${vectorStoreId}`);
console.log("Add this to .env:");
console.log(`OPENAI_VECTOR_STORE_ID=${vectorStoreId}`);

function inferCategory(fileName: string) {
  if (fileName.includes("campaign")) return "campaign";
  if (fileName.includes("policy") || fileName.includes("returns")) return "policy";
  if (fileName.includes("faq")) return "faq";
  if (fileName.includes("brand")) return "brand_guidelines";
  return "knowledge";
}
