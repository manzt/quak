import { assert } from "./util.ts";

export class AsyncBatchReader<T> {
	/** the iterable batches to read */
	#batches: Array<{ data: Iterator<T>; last: boolean }> = [];
	/** the index of the current row */
	#index: number = 0;
	/** resolves a promise for when the next batch is available */
	#resolve: (() => void) | null = null;
	/** the current batch */
	#current: { data: Iterator<T>; last: boolean } | null = null;
	/** A function to request more data. */
	#requestNextBatch: () => void;
	/**
	 * @param requestNextBatch - a function to request more data. When
	 * this function completes, it should enqueue the next batch, otherwise the
	 * reader will be stuck.
	 */
	constructor(requestNextBatch: () => void) {
		this.#requestNextBatch = requestNextBatch;
	}
	/**
	 * Enqueue a batch of data
	 *
	 * The last batch should have `last: true` set,
	 * so the reader can terminate when it has
	 * exhausted all the data.
	 *
	 * @param batch - the batch of data to enqueue
	 * @param options
	 * @param options.last - whether this is the last batch
	 */
	enqueueBatch(batch: Iterator<T>, { last }: { last: boolean }) {
		this.#batches.push({ data: batch, last });
		if (this.#resolve) {
			this.#resolve();
			this.#resolve = null;
		}
	}
	async next(): Promise<IteratorResult<{ row: T; index: number }>> {
		if (!this.#current) {
			if (this.#batches.length === 0) {
				/** @type {Promise<void>} */
				let promise: Promise<void> = new Promise((resolve) => {
					this.#resolve = resolve;
				});
				this.#requestNextBatch();
				await promise;
			}
			let next = this.#batches.shift();
			assert(next, "No next batch");
			this.#current = next;
		}
		let result = this.#current.data.next();
		if (result.done) {
			if (this.#current.last) {
				return { done: true, value: undefined };
			}
			this.#current = null;
			return this.next();
		}
		return {
			done: false,
			value: { row: result.value, index: this.#index++ },
		};
	}
}
