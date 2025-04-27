import csvData from '../dataset.csv';

export interface Env {
	VECTORIZE: Vectorize;
	AI: Ai;
}

interface EmbeddingResponse {
	shape: number[];
	data: number[][];
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		let path = new URL(request.url).pathname;
		if (path.startsWith("/favicon")) {
			return new Response("", { status: 404 });
		}

		// You only need to generate vector embeddings once (or as
		// data changes), not on every request
		if (path === "/insert") {
			// Parse the CSV data
			const lines = csvData.trim().split('\n');
			const textsToEmbed = lines.map((line: string) => {
				if (line.length < 3) return ''; // Handle potentially empty lines or just ","
				// Remove surrounding quotes and trailing comma: "...", -> ...
				// Note: This assumes the Python script correctly handled internal quotes.
				// If internal quotes were doubled (" -> ""), use: .replace(/""/g, '"')
				let content = line.slice(1, -2); 
				// Optionally unescape doubled quotes if the Python script did that:
				// content = content.replace(/""/g, '"');
				return content;
			}).filter((text: string) => text && text.length > 0); // Filter out any empty strings

			// Check if we actually got any text
			if (textsToEmbed.length === 0) {
				console.error("No text data found or parsed from dataset.csv");
				return new Response("No text data found in CSV to insert.", { status: 400 });
			}

			console.log(`Attempting to embed ${textsToEmbed.length} text snippets from CSV...`);
			const modelResp: EmbeddingResponse = await env.AI.run(
				"@cf/baai/bge-base-en-v1.5",
				{
					text: textsToEmbed, // Use the parsed data
				},
			);

			// Convert the vector embeddings into a format Vectorize can accept.
			// Each vector needs an ID, a value (the vector) and optional metadata.
			// In a real application, your ID would be bound to the ID of the source
			// document.
			let vectors: VectorizeVector[] = [];
			let id = 1;
			modelResp.data.forEach((vector) => {
				vectors.push({ id: `${id}`, values: vector });
				id++;
			});

			let inserted = await env.VECTORIZE.upsert(vectors);
			return Response.json(inserted);
		}

		// Your query: expect this to match vector ID. 1 in this example
		let userQuery = "orange cloud";
		const queryVector: EmbeddingResponse = await env.AI.run(
			"@cf/baai/bge-base-en-v1.5",
			{
				text: [userQuery],
			},
		);

		let matches = await env.VECTORIZE.query(queryVector.data[0], {
			topK: 1,
		});
		return Response.json({
			// Expect a vector ID. 1 to be your top match with a score of
			// ~0.89693683
			// This tutorial uses a cosine distance metric, where the closer to one,
			// the more similar.
			matches: matches,
		});
	},
} satisfies ExportedHandler<Env>;