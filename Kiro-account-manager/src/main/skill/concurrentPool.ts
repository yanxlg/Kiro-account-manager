/**
 * 并发池：限制最大 N 个任务同时执行。
 * 每完成一个任务立即调用 onResult 回调，同时从队列中取下一个开始执行。
 */
export async function runConcurrentPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
  onResult?: (result: R, index: number) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function runNext(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++
      const result = await worker(items[currentIndex])
      results[currentIndex] = result
      onResult?.(result, currentIndex)
    }
  }

  // 启动 concurrency 个 worker 通道
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runNext()
  )

  await Promise.all(workers)
  return results
}
