declare module "better-sqlite3" {
	interface DatabaseOptions {
		readonly?: boolean;
		fileMustExist?: boolean;
		timeout?: number;
		verbose?:
			| ((message?: unknown, ...additionalArgs: unknown[]) => void)
			| null;
		nativeBinding?: string;
	}

	interface RunResult {
		changes: number;
		lastInsertRowid: number | bigint;
	}

	interface Statement {
		run(...params: unknown[]): RunResult;
		get(...params: unknown[]): unknown;
		all(...params: unknown[]): unknown[];
		iterate(...params: unknown[]): IterableIterator<unknown>;
		pluck(toggleState?: boolean): this;
		expand(toggleState?: boolean): this;
		raw(toggleState?: boolean): this;
		bind(...params: unknown[]): this;
	}

	interface Transaction<T extends (...args: any[]) => any> {
		(...args: Parameters<T>): ReturnType<T>;
		default(...args: Parameters<T>): ReturnType<T>;
		deferred(...args: Parameters<T>): ReturnType<T>;
		immediate(...args: Parameters<T>): ReturnType<T>;
		exclusive(...args: Parameters<T>): ReturnType<T>;
	}

	class Database {
		constructor(filename?: string | Buffer, options?: DatabaseOptions);
		prepare(source: string): Statement;
		transaction<T extends (...args: any[]) => any>(fn: T): Transaction<T>;
		exec(source: string): this;
		pragma(source: string, options?: { simple?: boolean }): unknown;
		close(): this;
		open: boolean;
		inTransaction: boolean;
		name: string;
		readonly: boolean;
		memory: boolean;
	}

	export default Database;
}
