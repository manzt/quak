/**
 * Defer a promise.
 *
 * TODO: Should use Promise.withResolvers() when available.
 */
export function defer<Success, Reject>(): {
	promise: Promise<Success>;
	resolve: (value: Success) => void;
	reject: (reason?: Reject) => void;
} {
	let resolve;
	let reject;
	let promise = new Promise<Success>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	/** @ts-expect-error - resolve and reject are set */
	return { promise, resolve, reject };
}
