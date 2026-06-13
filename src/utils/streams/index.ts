// Minimal structural descriptions of the WHATWG stream surfaces the bridges touch.
// Declared locally rather than taken from lib.dom or @types/node so the package
// presumes no type environment: any real ReadableStream/WritableStream — browser,
// Node (>= 18), Deno, Bun — satisfies these, and the project's lib can stay ES-only.
// (tests/streams-dom.type-test.ts compiles against lib.dom to keep that claim true.)

export type ReadableStreamReadResultLike<T> =
  // The done result's value is T | undefined rather than undefined: BYOB readers
  // can return an unconsumed chunk alongside done, which is how lib.dom types it,
  // and a narrower type here would reject real browser readers.
  | { done: false; value: T }
  | { done: true; value?: T };

export type ReadableStreamDefaultReaderLike<T> = {
  read(): Promise<ReadableStreamReadResultLike<T>>;
  cancel(reason?: unknown): Promise<unknown>;
  // Optional so that hand-rolled duck-typed streams remain acceptable; the bridges
  // call it (guardedly) to unlock the stream once they are done with it.
  releaseLock?(): void;
};

// The BYOB reader's shape, present only so that getReader's return below can mirror
// lib.dom's: the bridges never request one.
export type ReadableStreamBYOBReaderLike = {
  read(view: ArrayBufferView): Promise<unknown>;
  cancel(reason?: unknown): Promise<unknown>;
  releaseLock?(): void;
};

export type ReadableStreamLike<T> = {
  // The union exists for lib.dom interop: its getReader is overloaded, and when TS
  // infers T against this type it does so from the final overload, which returns
  // DefaultReader<T> | BYOBReader. A default-reader-only return here makes that
  // inference collapse to the BYOB view type instead of T. Callers (the pump) cast
  // a zero-argument getReader() back down to the default reader, which is what the
  // spec guarantees it returns.
  getReader(): ReadableStreamDefaultReaderLike<T> | ReadableStreamBYOBReaderLike;
};

// Recovers the chunk type from a stream's default reader. The call-signature dance
// (rather than `S extends ReadableStreamLike<infer T>`) is deliberate: lib.dom's
// getReader is overloaded, inference reads only its final overload — which returns
// DefaultReader<T> | BYOBReader — and matching that union against a generic
// ReadableStreamLike<T> pollutes T with the BYOB view type. Extracting the reader
// whose read() takes no arguments pins inference to the default reader alone. This
// is the one conditional type in the public API; structural interop with foreign
// overloads has no conditional-free shape.
export type ReadableStreamChunkOf<S> =
  S extends { getReader(...args: any[]): infer Reader }
    ? Extract<Reader, { read(): any }> extends { read(): Promise<infer Result> }
      ? Extract<Result, { done: false }> extends { done: false; value: infer T }
        ? T
        : never
      : never
    : never;

export type WritableStreamDefaultWriterLike<T> = {
  // Awaiting write's promise is WHATWG backpressure: it settles when the sink has
  // accepted the chunk and there is capacity for another.
  write(chunk: T): Promise<unknown>;
  close(): Promise<unknown>;
  abort(reason?: unknown): Promise<unknown>;
  // Optional so that hand-rolled duck-typed streams remain acceptable; the bridges
  // call it (guardedly) to unlock the stream once they are done with it.
  releaseLock?(): void;
};

export type WritableStreamLike<T> = {
  getWriter(): WritableStreamDefaultWriterLike<T>;
};
