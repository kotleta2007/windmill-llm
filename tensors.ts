import * as tf from '@tensorflow/tfjs';

export async function similarity(x1: number[], x2: number[]): Promise<number> {
  if (x1.length !== x2.length) {
    throw new Error("Embedding lengths are different!");
  }

  const u = tf.tensor1d(x1)
  const v = tf.tensor1d(x2)

  const dotProduct = tf.dot(u, v)
  const norm1 = tf.norm(u)
  const norm2 = tf.norm(v)

  // const cosine = dotProduct / (norm1 * norm2)
  const cosine = tf.div(dotProduct, tf.mul(norm1, norm2))

  const n = await cosine.data()
  return n[0]
}
