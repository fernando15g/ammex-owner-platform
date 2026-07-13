/** @type {import('next').NextConfig} */
const nextConfig = {
  // The proposal is generated from the REAL Excel template, so that file has to
  // ship with the deployment. Without this, Next's file tracing prunes it and
  // the route dies at runtime with "no such file" — on Vercel only, which is the
  // worst place to find out.
  outputFileTracingIncludes: {
    "/api/bids/[id]/proposal": ["./templates/**"],
  },
};
module.exports = nextConfig;
