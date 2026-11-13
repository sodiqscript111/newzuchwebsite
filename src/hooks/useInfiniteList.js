import { useEffect, useRef, useState } from "react";

// The shop grid scrolls inside its own panel, not the page, so watch whichever box scrolls.
const scrollParent = (element) => {
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
};

// Shows `pageSize` items at first and adds the next batch when the sentinel element
// scrolls near the screen. Starts again from the first batch when `resetKey` changes.
export const useInfiniteList = (items, { pageSize = 8, resetKey } = {}) => {
  const [count, setCount] = useState(pageSize);
  const sentinelRef = useRef(null);

  useEffect(() => {
    setCount(pageSize);
  }, [resetKey, pageSize]);

  const hasMore = count < items.length;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setCount((current) => Math.min(current + pageSize, items.length));
        }
      },
      { root: scrollParent(sentinel), rootMargin: "600px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, items.length, pageSize, count]);

  const loadMore = () => setCount((current) => Math.min(current + pageSize, items.length));

  return { visible: items.slice(0, count), hasMore, sentinelRef, loadMore };
};
