/** Bound multipart bytes while reading, including clients that omit Content-Length. */
export async function readJobMultipart(request: Request, maxFileBytes: number, maxFiles: number) {
  const maxBytes = maxFileBytes * maxFiles + 128 * 1024;
  if (Number(request.headers.get("content-length")) > maxBytes || !request.body) throw new Error("The request exceeds this type's upload limit.");
  let size = 0;
  const body = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > maxBytes) throw new Error("The request exceeds this type's upload limit.");
      controller.enqueue(chunk);
    },
  }));
  return new Response(body, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
}
