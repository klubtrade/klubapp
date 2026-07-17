/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@klub/api-client", "@klub/calc"],
  async redirects() {
    return [
      {
        source: "/quick-trade",
        destination: "/trade",
        permanent: true,
      },
      {
        source: "/home",
        destination: "/portfolio",
        permanent: true,
      },
    ];
  },
};

export default config;
