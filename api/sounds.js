import { catalog } from "../server/catalog.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  const sounds = catalog.map(
    ({ id, name, category, price, file }) => ({
      id,
      name,
      category,
      price,
      preview: `/sounds/${encodeURIComponent(file)}`,
    })
  );

  return res.status(200).json(sounds);
}