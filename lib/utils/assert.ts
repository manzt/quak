/**
 * Error thrown when an assertion fails.
 */
export class AssertionError extends Error {
	/** @param message The error message. */
	constructor(message: string) {
		super(message);
		this.name = "AssertionError";
	}
}

/**
 * Make an assertion. An error is thrown if `expr` does not have truthy value.
 *
 * @param expr The expression to test.
 * @param msg The message to display if the assertion fails.
 */
export function assert(expr: unknown, msg = ""): asserts expr {
	if (!expr) {
		throw new AssertionError(msg);
	}
}
