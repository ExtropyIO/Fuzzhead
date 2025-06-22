/**
 * A simple function that adds two numbers.
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * A simple arrow function that creates a greeting.
 */
export const greet = (name: string): string => {
  return `Hello, ${name}!`;
};

/**
 * A function with a boolean check.
 */
export const isOldEnough = (age: number): boolean => {
    return age >= 18;
}

/**
 * An internal function that should NOT be called by the fuzzer.
 */
function internalHelper() {
  console.log("This should not be logged during fuzzing.");
}