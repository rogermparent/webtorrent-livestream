import fs from "fs/promises";
import path from "path";
import chokidar from "chokidar";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import type { Torrent } from "webtorrent";
import WebTorrent from "webtorrent-hybrid";
import createTorrent from "create-torrent";
import parseTorrent, { toMagnetURI } from "parse-torrent";
import EventEmitter from "events";

EventEmitter.setMaxListeners(Infinity);

const MAX_SEEDED_TORRENTS = 5;
const announce = ["ws://localhost:8033"];

const client = new WebTorrent({
  dht: { bootstrap: announce },
  tracker: {
    announce,
  },
});

const argv = yargs(hideBin(process.argv))
  .options({ inputFile: { type: "string" }, outputFile: { type: "string" } })
  .alias({
    inputFile: ["i"],
    outputFile: ["o"],
  }).argv;

const buildMagnetData = async (
  inputFilename: string,
  outputFilename: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    createTorrent(
      inputFilename,
      { announceList: undefined, urlList: undefined },
      async (err, createdTorrent) => {
        if (createdTorrent) {
          const parsedTorrent = await parseTorrent(createdTorrent);
          delete parsedTorrent.announce;
          const magnetURI = toMagnetURI(parsedTorrent) + "\n";
          await Promise.all([
            fs.writeFile(inputFilename + ".torrent", createdTorrent),
            fs.writeFile(outputFilename, magnetURI),
          ]);
          resolve(magnetURI);
        } else {
          reject(err);
        }
      }
    );
  });
};

const getMagnet = async (inputFilename: string): Promise<string> => {
  const magnetFilename = inputFilename + ".magnet";
  try {
    return String(await fs.readFile(magnetFilename));
  } catch (e) {
    return buildMagnetData(inputFilename, magnetFilename);
  }
};

const startReadingPlaylistFile = async ({
  inputFile,
  outputFile,
}: {
  inputFile: string;
  outputFile: string;
}) => {
  const inputDirname = path.resolve(path.dirname(inputFile));
  const absoluteOutputFile = path.resolve(inputDirname, outputFile);

  let cache: Record<string, string> = {};
  const torrents: Torrent[] = [];

  const handleMediaFile = async (
    cache: Record<string, string>,
    newCache: Record<string, string>,
    filePath: string,
    onNewTorrent?: (torrent: Torrent) => void
  ) => {
    const result: string =
      cache[filePath] || (await getMagnet(path.join(inputDirname, filePath)));
    const torrentFilePath = path.resolve(inputDirname, filePath + ".torrent");
    if (!cache[filePath]) {
      try {
        const existingTorrent = client.get(torrentFilePath);
        if (!existingTorrent) {
          const newTorrent = client.add(torrentFilePath, {
            path: inputDirname,
            announce,
          });
          if (onNewTorrent) {
            onNewTorrent(newTorrent);
          }
        } else {
          console.log("Torrent exists for", existingTorrent.name);
        }
      } catch (e) {
        console.error(e);
      }
    }
    newCache[filePath] = result;
    return result;
  };

  const readPlaylistFile = async () => {
    const textContent = String(await fs.readFile(inputFile)).trim();
    if (textContent) {
      const newCache: Record<string, string> = {};
      const linePromises: Promise<string>[] = [];
      const lines = textContent.split("\n");
      for (const line of lines) {
        if (line) {
          const commandRegexResult = /^#(.*?)(?::(.*))?$/.exec(line);
          if (commandRegexResult) {
            const directive = commandRegexResult[1];
            const args = commandRegexResult[2];
            switch (directive) {
              case "EXT-X-MAP":
                const initFilePathResult = /URI="(.*?)"/.exec(args);
                if (initFilePathResult) {
                  const initFilePath = initFilePathResult[1];
                  linePromises.push(
                    handleMediaFile(cache, newCache, initFilePath)
                  );
                }
                break;
            }
          } else {
            linePromises.push(
              handleMediaFile(cache, newCache, line, (newTorrent) => {
                torrents.push(newTorrent);
                if (torrents.length > MAX_SEEDED_TORRENTS) {
                  const oldestTorrent = torrents.shift();
                  if (oldestTorrent) {
                    oldestTorrent.destroy();
                    console.log(torrents.map(({ name }) => name));
                  }
                }
              })
            );
          }
        }
      }
      const magnets = await Promise.all(linePromises);
      cache = newCache;
      const fileText = magnets.join("");
      return fs.writeFile(absoluteOutputFile, fileText);
    }
  };

  const interval = setInterval(readPlaylistFile, 2000);

  return new Promise<void>((resolve) => {
    process.once("SIGINT", () => {
      console.log("SIGINT received! Cancelling stream writer.");
      clearInterval(interval);
      resolve();
    });
  });
};

const main = async () => {
  const { inputFile, outputFile = "stream.magnets" } = await argv;

  if (!inputFile) {
    throw new Error("inputFile option not supplied!");
  }

  const inputFileStats = await fs.stat(inputFile);
  if (inputFileStats.isDirectory()) {
    console.log("Waiting for playlist file in directory", inputFile);
    await new Promise<void>((resolve) => {
      const handleInterrupt = () => {
        console.log("SIGINT received! Cancelling file search.");
        resolve();
      };
      process.on("SIGINT", handleInterrupt);
      const playlistFileFinder = chokidar.watch(path.join(inputFile, "*.m3u8"));
      playlistFileFinder.on("add", async (addedPath) => {
        console.log("Attaching to playlist file", addedPath);
        process.off("SIGINT", handleInterrupt);
        await playlistFileFinder.close();
        resolve(startReadingPlaylistFile({ inputFile: addedPath, outputFile }));
      });
    });
  } else {
    console.log("Directly using playlist file", inputFile);
    await startReadingPlaylistFile({ inputFile, outputFile });
  }
  process.exit(0);
};

main();
