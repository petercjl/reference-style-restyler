import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CliError } from "./context.mjs";

export async function matchCanvas({ input, generated, output, mode = "cover" }) {
  if (!input || !generated || !output) throw new CliError("ARGUMENT_REQUIRED", "--input, --generated and --output are required");
  if (!["cover", "contain"].includes(mode)) throw new CliError("INVALID_MODE", "--mode must be cover or contain");
  for (const file of [input, generated]) await fs.access(file);
  if (path.resolve(output) === path.resolve(input) || path.resolve(output) === path.resolve(generated)) throw new CliError("OUTPUT_CONFLICT", "Output must differ from both inputs");
  try { await fs.lstat(output); throw new CliError("OUTPUT_EXISTS", `Output already exists: ${output}`); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const source = await sharp(input).metadata();
  const candidate = await sharp(generated).metadata();
  const width = source.autoOrient?.width || (source.orientation >= 5 && source.orientation <= 8 ? source.height : source.width);
  const height = source.autoOrient?.height || (source.orientation >= 5 && source.orientation <= 8 ? source.width : source.height);
  const outputExt = path.extname(output).toLowerCase();
  const format = outputExt === ".png" ? "png" : [".jpg", ".jpeg"].includes(outputExt) ? "jpeg" : outputExt === ".webp" ? "webp" : null;
  if (!format) throw new CliError("UNSUPPORTED_FORMAT", "Output extension must be PNG, JPG, or WebP");
  await fs.mkdir(path.dirname(output), { recursive: true });
  let pipeline = sharp(generated).rotate().resize(width, height, { fit: mode, position: "centre", background: "#ffffff" });
  if (format === "jpeg") pipeline = pipeline.jpeg({ quality: 95, chromaSubsampling: "4:4:4" });
  else if (format === "png") pipeline = pipeline.png();
  else pipeline = pipeline.webp({ quality: 95 });
  await pipeline.toFile(output);
  const result = await sharp(output).metadata();
  return { ok: result.width === width && result.height === height, input_size: [width, height], generated_size: [candidate.width, candidate.height], output_size: [result.width, result.height], output_format: format, mode, output: path.resolve(output) };
}
