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

			console.log(`Total text snippets to process: ${textsToEmbed.length}`);

			const batchSize = 200; // Process in batches of 200
			let totalInserted = 0;
			let vectorIdCounter = 1; // Ensure unique IDs across batches

			try {
				for (let i = 0; i < textsToEmbed.length; i += batchSize) {
					const batch = textsToEmbed.slice(i, i + batchSize);
					console.log(`Processing batch ${Math.floor(i / batchSize) + 1}: items ${i + 1} to ${Math.min(i + batchSize, textsToEmbed.length)}`);

					// Get embeddings for the current batch
					const modelResp: EmbeddingResponse = await env.AI.run(
						"@cf/baai/bge-base-en-v1.5",
						{
							text: batch,
						}
					);

					// Prepare vectors for Vectorize
					let vectors: VectorizeVector[] = [];
					modelResp.data.forEach((vector) => {
						// Use original text as metadata? Could be useful but large.
						// For now, just use ID. Ensure ID is unique across all batches.
						vectors.push({ id: `${vectorIdCounter}`, values: vector }); 
						vectorIdCounter++;
					});

					// Insert the batch into Vectorize
					if (vectors.length > 0) {
						// upsert returns void on success, throws on error
						await env.VECTORIZE.upsert(vectors);
						console.log(`  Batch of ${vectors.length} vectors upserted successfully.`);
						totalInserted += vectors.length; // Add batch size on success
					}
				}
				return Response.json({ success: true, totalVectorsInserted: totalInserted });

			} catch (error) {
				// Type guard for error handling
				let errorMessage = "An unknown error occurred during batch processing.";
				if (error instanceof Error) {
					console.error(`Error during batch processing: ${error.message}`);
					errorMessage = error.message;
					// Check if error has more details in cause
					if (error.cause) {
						try {
							console.error(`Error cause: ${JSON.stringify(error.cause)}`);
						} catch (stringifyError) {
							console.error("Could not stringify error cause.");
						}
					}
				} else {
					console.error("An unexpected error type occurred:", error);
				}
				return new Response(`Error during batch processing: ${errorMessage}`, { status: 500 });
			}
		}

		// Your query: expect this to match
		let userQuery = "CAPS";
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