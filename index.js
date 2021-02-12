const express = require('express')
const app = express();
const port = 3000;

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const scraper = require("./scrape");

/**
 * Serve file with gpx points
 */
app.get('/download-file', (req, res) => {
    const filePath = path.join(__dirname, scraper.gpxFile);

    if (fs.existsSync(filePath)) {
        res.writeHead(200, {
            "Content-Type": "application/xml",
            "Content-Disposition": "attachment; filename=test.gpx"
        });

        fs.createReadStream(filePath).pipe(res);
    } else {
        res.status(404).end("Ne obstaja");
    }
});

/**
 * Manually check if files are outdated
 */
app.get('/update', (req, res) => {
    scraper.checkForDate(function (success, error) {
        if (success) {
            res.writeHead(200, {'Content-Type': 'text/plain'});
            res.end("Super");
        } else {
            console.log("Error: ", error.message);
            res.status(500).send(error.message);
        }
    });
});

/**
 * Check if files are outdated, every week on sunday at 00:00
 */
cron.schedule('0 0 * * 0', function () {
    scraper.checkForDate(function (success, error) {
        if (success) {
            console.log("Success");
        } else {
            console.log(error);
        }
    });
});

/**
 * Expose app on specified port
 */
app.listen(port, () => {
    console.log(`STKP backend listening on port ${port}!`);
});

// Ponovni zagon nodemon
process.once('SIGUSR2', () => {
    console.log("Ponovni zagon nodemon");
    process.kill(process.pid, 'SIGUSR2');
});

// Izhod iz aplikacije
process.on('SIGINT', () => {
    console.log("Izhod iz aplikacije");
    process.exit(0);
});

// Izhod iz aplikacije preko Docker
process.on('SIGTERM', () => {
    console.log("Izhod iz aplikacije preko Docker");
    process.exit(0);
});
