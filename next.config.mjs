/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // pdf-parse uses canvas which is not available in the browser
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
