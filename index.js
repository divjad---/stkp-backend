const express = require('express')
const app = express();

const port = process.env.PORT || '3000';

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const scraper = require("./scrape");

const version = "v1.1"

app.get('/', (req, res) => {
    res.end("STKP backend " + version);
});

/**
 * Accepts a query parameter
 */
app.get('/download', (req, res) => {
	let filename = scraper.getFullFilename("ZIP");
    const filePath = path.join(__dirname, scraper.dl_location + filename);

    if (fs.existsSync(filePath)) {
        res.writeHead(200, {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename=${filename}`
        });
		
        fs.createReadStream(filePath).pipe(res);
    } else {
        res.status(404).end("Datoteka ne obstaja");
    }
});

/**
 * Reads date from the ZIP filename (Zip contains the newest of both dates).
 * Sends back a string in DD-MM-YYYY format
 */
app.get('/get-latest-date', (req, res) => {
	try {
        let filename = scraper.getFullFilename("ZIP");
        const filePath = path.join(__dirname, scraper.dl_location + filename);

        if (fs.existsSync(filePath)) {
            const date = filename.split(/[_.]/)[1];
            res.status(200).json({
                "date": date,
            });
        }else{
            res.status(404).json({
                "date": null,
            });
        }
	} catch (e) {
		console.log(e);
		res.status(500).end("Internal server error");
	}
});

/**
 * Reads date from the ZIP filename (Zip contains the newest of both dates)
 * and converts it to a number. If the filename contained a date "YYYY-MM-DD",
 * sends back a number YYYYMMDD
 */
app.get('/get-latest-date-number', (req, res) => {
	try {
        let filename = scraper.getFullFilename("ZIP");
        const filePath = path.join(__dirname, scraper.dl_location + filename);

        if (fs.existsSync(filePath)) {
            const date = scraper.getDateNumber("ZIP");
            res.status(200).json({
                "date-number": date,
            });
        }else{
            res.status(404).json({
                "date-number": null,
            });
        }
	} catch (e) {
		console.log(e);
		res.status(500).end("Internal server error");
	}
});

/**
 * Manually check if files are outdated
 */
app.get('/update', (req, res) => {
    scraper.checkForDate(function (success, error) {
        if (success) {
            res.writeHead(200, {'Content-Type': 'text/plain'});
            res.end("Files up to date.");
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
