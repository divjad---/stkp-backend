const express = require('express')
const app = express();
const port = 3000;

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const scraper = require("./scrape");

/**
 * Accepts a query parameter
 */
app.get('/download', (req, res) => {

	var filename;
	// http://localhost:3000/update?type=zip
	if (req.query && req.query.type) {
		switch (req.query.type){
			case "et":
				filename = scraper.get_full_filename("ET");
				break;
			case "kt":
				filename = scraper.get_full_filename("KT");
				break;
			case "zip":
				filename = scraper.get_full_filename("ZIP");
				break;
			default:
				res.status(400).end("Wrong parameter value");
		}
	}
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
 * Sends back a string in 2019-09-03 format
 */
app.get('/get-latest-date', (req, res) => {
	try {
		const date = scraper.get_full_filename("ZIP").split(/_|\./)[1];
		res.status(200).json({
			"latest-date": date,	
		});
	} catch (e) {
		console.log(e);
		res.status(500).end("Internal server error");
	}
})
/**
 * Reads date from the ZIP filename (Zip contains the newest of both dates)
 * and converts it to a number. If the filename contained a date "2019-09-03",
 * sends back a number 20190903
 */
app.get('/get-latest-date-number', (req, res) => {
	try {
		const date = scraper.get_date_number("ZIP");
		res.status(200).json({
			"latest-date-number": date,	
		});
	} catch (e) {
		console.log(e);
		res.status(500).end("Internal server error");
	}
})


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
