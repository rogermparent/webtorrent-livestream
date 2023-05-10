import React, { Reducer, useEffect, useReducer, useState } from "react";
import type { Instance, Torrent, WebTorrent } from "webtorrent";
import { useMagnetList } from "../hooks/useMagnetList";
import { Script } from "gatsby";
import * as IDBChunkStore from "idb-chunk-store";
import * as styles from "./styles.module.css";

const UPDATE_INTERVAL = 2000;

const announce =
  typeof window !== "undefined"
    ? [`ws://${window.location.hostname}:8033`]
    : undefined;

declare global {
  interface Window {
    WebTorrent: WebTorrent;
  }
}

const fetchMagnets = async (url: string, cb: (magnets: string[]) => void) => {
  const response = await fetch(url);
  const magnetsText = await response.text();
  if (magnetsText) {
    const magnetsArray = magnetsText.trim().split("\n");
    cb(magnetsArray);
  }
};

const progressToPercent = (progress: number) =>
  progress ? Math.ceil(progress * 100) : 0;
const TorrentComponent = ({ torrent }: { torrent: Torrent }) => {
  const [progress, setProgress] = useState<number>(
    progressToPercent(torrent.progress)
  );
  useEffect(() => {
    const handler = () => {
      setProgress(progressToPercent(torrent.progress));
    };
    torrent.on("download", handler);
    torrent.on("done", handler);
    return () => {
      torrent.off("download", handler);
      torrent.off("done", handler);
    };
  }, []);

  return (
    <span className={styles.magnetIcon}>
      <span
        className={styles.magnetIconContents}
        style={{ width: progress ? `${progress}%` : 0 }}
      />
    </span>
  );
};

let globalInstance: Instance | undefined;
const defaultMime = 'video/mp4; codecs="avc1.4D4028, mp4a.40.2"';

function useQueue<T>() {
  return useReducer<
    Reducer<T[], { type: "add"; item: T | T[] } | { type: "pop" }>
  >((state, action) => {
    switch (action.type) {
      case "add":
        return state.concat(action.item);
      case "pop":
        return state.slice(1);
      default:
        return state;
    }
  }, []);
}

const StreamPage = () => {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(
    null
  );
  const [webtorrentInstance, setWebtorrentInstance] = useState<Instance>();

  const [mediaSourceState, setMediaSourceState] = useState<{
    mediaSource?: MediaSource;
    mediaSourceUrl?: string;
    sourceBuffer?: SourceBuffer;
  }>({});

  const [sourceBufferUpdating, setSourceBufferUpdating] =
    useState<boolean>(true);

  const { mediaSource, sourceBuffer } = mediaSourceState;

  const [queuedBuffers, queuedBuffersDispatch] = useQueue<ArrayBufferLike>();
  const [initialSegmentAppended, setInitialSegmentAppended] = useState(false);

  useEffect(() => {
    if (videoElement) {
      videoElement.addEventListener("stalled", () => {
        console.log("stalled");
      });
      videoElement.addEventListener("waiting", () => {
        console.log("waiting");
      });
      videoElement.addEventListener("playing", () => {
        console.log("playing");
      });
      if (window.MediaSource) {
        const mediaSource = new MediaSource();
        const mediaSourceUrl = URL.createObjectURL(mediaSource);
        const handleOpen = () => {
          mediaSource.duration = 0;
          const sourceBuffer = mediaSource.addSourceBuffer(defaultMime);
          setMediaSourceState({ mediaSource, mediaSourceUrl, sourceBuffer });
          setSourceBufferUpdating(false);
        };
        mediaSource.addEventListener("sourceopen", handleOpen);
        videoElement.src = mediaSourceUrl;
        function onAbort(this: HTMLVideoElement, e: Event) {
          console.log("Abort", e);
        }
        videoElement.addEventListener("abort", onAbort);
        function onSeeking(this: HTMLVideoElement, e: Event) {
          console.log("Seeking", e);
        }
        videoElement.addEventListener("seeking", onSeeking);
        return () => {
          mediaSource.removeEventListener("sourceopen", handleOpen);
          videoElement.removeEventListener("seeking", onSeeking);
          videoElement.removeEventListener("abort", onAbort);
          setMediaSourceState({});
        };
      } else {
        console.error("The Media Source Extensions API is not supported.");
      }
    }
  }, [videoElement]);

  useEffect(() => {
    if (sourceBuffer) {
      const setNotUpdating = () => {
        console.log("setNotUpdating");
        setSourceBufferUpdating(false);
      };
      sourceBuffer.addEventListener("update", setNotUpdating);

      return () => {
        sourceBuffer.removeEventListener("update", setNotUpdating);
      };
    }
  }, [sourceBuffer, setSourceBufferUpdating]);

  const [nextBuffer] = queuedBuffers;

  useEffect(() => {
    if (nextBuffer && mediaSource && sourceBuffer && !sourceBufferUpdating) {
      if (sourceBuffer.updating !== sourceBufferUpdating) {
        console.warn("sourceBufferUpdating state is a false negative!");
      }
      const bufferedRanges = sourceBuffer.buffered.length;
      if (bufferedRanges > 0 && videoElement) {
        for (let i = 0; i < bufferedRanges; i++) {
          const start = sourceBuffer.buffered.start(i);
          if (start > videoElement?.currentTime) {
            videoElement.currentTime = start;
            break;
          }
        }
      }
      setSourceBufferUpdating(true);
      sourceBuffer.appendBuffer(nextBuffer);
      queuedBuffersDispatch({ type: "pop" });
    }
  }, [
    mediaSource,
    sourceBuffer,
    nextBuffer,
    sourceBufferUpdating,
    videoElement,
  ]);

  const url = "/stream.magnets";

  const webtorrentAddOptions = {
    store: IDBChunkStore,
    announce,
  };

  const { torrents } = webtorrentInstance || ({} as Partial<Instance>);
  const [magnetsListState, addMagnetsToList] = useMagnetList();
  const { newMagnets, initMagnet } = magnetsListState;
  useEffect(() => {
    if (
      initMagnet &&
      webtorrentInstance &&
      sourceBuffer &&
      !initialSegmentAppended
    ) {
      const startInitialTorrentAppend = (torrent: Torrent) => {
        torrent.files[0].getBuffer((err, buffer) => {
          if (err) {
            console.error(
              "Error getting buffer for torrent: ",
              torrent.name,
              torrent.infoHash
            );
          }
          if (buffer && sourceBuffer) {
            setSourceBufferUpdating(true);
            sourceBuffer.appendBuffer(buffer.buffer);
            setInitialSegmentAppended(true);
          }
        });
      };
      const existingTorrent = webtorrentInstance.get(initMagnet);
      if (existingTorrent) {
        startInitialTorrentAppend(existingTorrent);
      } else {
        const torrent = webtorrentInstance.add(
          initMagnet,
          webtorrentAddOptions,
          startInitialTorrentAppend
        );
        console.log("Adding init torrent", torrent);
      }
    }
  }, [initMagnet, webtorrentInstance]);

  useEffect(() => {
    if (newMagnets && webtorrentInstance) {
      for (const newMagnet of newMagnets) {
        const existingTorrent = webtorrentInstance.get(newMagnet);
        if (!existingTorrent) {
          const torrent = webtorrentInstance.add(
            newMagnet,
            webtorrentAddOptions
          );
          torrent.on("done", () => {
            torrent.files[0].getBuffer((err, buffer) => {
              if (err) {
                console.error(
                  "Error getting buffer for torrent: ",
                  torrent.name,
                  torrent.infoHash
                );
              }
              if (buffer && sourceBuffer) {
                queuedBuffersDispatch({ type: "add", item: buffer.buffer });
              }
            });
          });
        }
      }
    }
  }, [webtorrentInstance, newMagnets, queuedBuffersDispatch]);

  useEffect(() => {
    if (globalInstance) {
      setWebtorrentInstance(globalInstance);
    }
    const updateMagnets = () => {
      fetchMagnets(url, (magnets) => addMagnetsToList(magnets));
    };
    updateMagnets();
    const updaterIntervalId = window.setInterval(
      updateMagnets,
      UPDATE_INTERVAL
    );
    return () => window.clearInterval(updaterIntervalId);
  }, []);

  return (
    <div>
      <Script
        src="/webtorrent.min.js"
        strategy="post-hydrate"
        onLoad={() => {
          const instance =
            globalInstance ||
            new window.WebTorrent({
              tracker: {
                announce,
              },
            });
          globalInstance = instance;
          setWebtorrentInstance(instance);
        }}
      />
      <video
        muted={true}
        autoPlay={true}
        ref={setVideoElement}
        controls={true}
        className={styles.video}
      />
      <button
        onClick={() => {
          if (mediaSource) {
            mediaSource.endOfStream();
          }
        }}
      >
        End
      </button>
      <div>
        {torrents?.map((torrent) => (
          <TorrentComponent torrent={torrent} key={torrent.infoHash} />
        ))}
      </div>
      <h1>Magnets List</h1>
      <pre className={styles.infoWindow}>
        {magnetsListState
          ? JSON.stringify(magnetsListState, undefined, 2)
          : "No magnets list!"}
      </pre>
    </div>
  );
};

export default StreamPage;

export const Head = () => {
  return <></>;
};
