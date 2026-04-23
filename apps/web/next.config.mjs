/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@klub/api-client', '@klub/calc'],
};

export default config;
