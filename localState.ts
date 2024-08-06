import { readFile, writeFile } from "fs/promises";

const STATE_FILE = "state.json";

export async function getState(): Promise<any> {
  try {
    const data = await readFile(STATE_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // File doesn't exist, return null as default state
      return null;
    }
    throw error;
  }
}

export async function setState(value: any): Promise<void> {
  await writeFile(STATE_FILE, JSON.stringify(value), "utf-8");
}

// Example usage
async function main() {
  console.log("Current state:", await getState());

  // Example with a number
  await setState(42);
  console.log("New state (number):", await getState());

  // Example with a string
  await setState("Hello, world!");
  console.log("New state (string):", await getState());

  // Example with an object
  await setState({ name: "Alice", age: 30 });
  console.log("New state (object):", await getState());

  // Example with an array
  await setState([1, 2, 3, 4, 5]);
  console.log("New state (array):", await getState());
}

// main().catch(console.error);
