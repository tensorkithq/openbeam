// Fuse.js search now runs in a Web Worker — this file re-exports the client API.
export {
  searchContextWithFuse,
  clearContextSearchCache,
  prefetchFuseIndex,
} from "./fuse-search-client"
