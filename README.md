# WebTorrent Livestream

This monorepo is made to host tools that enable a minimal [WebTorrent](https://webtorrent.io)-based livestream based on a custom HLS-like protocol.

## Reader

This tiny application repeatedly reads a local `.m3u8` file, writing out its own `.magnets` playlist file that contains only magnet files.

## Client

A GatsbyJS-based React application that reads a `.magnets` playlist file, playing the result in a `video` element using the MediaSource Extensions API.
