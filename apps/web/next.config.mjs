/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@klub/api-client", "@klub/calc"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=()",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/quick-trade/:path*",
        destination: "/trade/:path*",
        permanent: true,
      },
      {
        source: "/home/:path*",
        destination: "/portfolio/:path*",
        permanent: true,
      },
      {
        source: "/follow/:path*",
        destination: "/copy/:path*",
        permanent: true,
      },
      {
        source: "/copy-trade/:path*",
        destination: "/copy/:path*",
        permanent: true,
      },
      {
        source: "/cash/:path*",
        destination: "/funding/:path*",
        permanent: true,
      },
      {
        source: "/ramp/:path*",
        destination: "/funding/add/:path*",
        permanent: true,
      },
    ];
  },
};

export default config;
