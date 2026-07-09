/** A promise with externally-controlled resolution — the heart of the permission ask flow. */
export class Deferred<T> {
  readonly promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (error: unknown) => void;
  settled = false;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = (value) => {
        this.settled = true;
        resolve(value);
      };
      this.reject = (error) => {
        this.settled = true;
        reject(error);
      };
    });
  }
}
