import type { GatsbyConfig } from "gatsby";

const config: GatsbyConfig = {
  siteMetadata: {
    title: `WebTorrent Livestream`,
    siteUrl: `https://webtorrent-livestream.com`,
  },
  graphqlTypegen: true,
};

export default config;
