(require("http")).request({
    host: "localhost",
    path: "/health",
    method: "GET",
    port: parseInt(process.argv[2]) || 3000,
    timeout: 2000
}, (res) => {
    process.exit(res.statusCode == 200 ? 0 : 1);
}).on('error', () => {
    process.exit(1);
}).end();