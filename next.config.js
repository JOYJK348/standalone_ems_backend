/** @type {import('next').NextConfig} */
const nextConfig = {
    typescript: {
        ignoreBuildErrors: true,
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
    async headers() {
        return [
            {
                source: '/api/:path*',
                headers: [
                    { key: 'Access-Control-Allow-Credentials', value: 'true' },
                    { key: 'Access-Control-Allow-Origin', value: '*' },
                    { key: 'Access-Control-Allow-Methods', value: 'GET,DELETE,PATCH,POST,PUT,OPTIONS' },
                    {
                        key: 'Access-Control-Allow-Headers',
                        value: 'Authorization, Content-Type, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version, Cache-Control, Pragma, Expires, x-durkkas-client-ip, x-device-fingerprint, x-company-id, x-branch-id, X-Durkkas-Client-IP, X-Device-Fingerprint, X-Company-Id, X-Branch-Id'
                    },
                ],
            },
        ];
    },
}

module.exports = nextConfig
