const axios = require('axios');
const cheerio = require('cheerio');

const http = require('http'); // or 'https' for https:// URLs
const fs = require('fs');
var AdmZip = require('adm-zip');

const url = 'https://pzs.si/ktk/wpstkp/pregled-etap/';

// Array with months for replacing word with number
const monthsArr = ["januar", "februar", "marec", "april", "maj", "junij", "julij",
    "avgust", "september", "oktober", "november", "december"];

//Inti variable so its not null at startup
let savedDate = new Date();

// Path and names of downloaded zip and extracted file with gpx points
const zipFile = "downloads/file.zip";
const gpxFile = "downloads/test.gpx";

/**
 * Scrape website and download files if necessary
 * @param callback
 */
const checkForDate = function checkForDate(callback) {
    axios(url)
        .then(response => {
            // Get html code
            const html = response.data;
            const $ = cheerio.load(html);

            // Get all urls with gpx files
            const links = $('h3 > strong');
            const firstLink = links[0].children[1].attribs["href"];

            // Get paragraphs immediately preceded by div for latest date
            const allP = $('h3 ~ p');
            const firstP = allP[0].children[0].data;
            let date = firstP.replace(/\(nova verzija GPX datotek |\)/gi, "");
            console.log("Date from website: ", date);

            // Delete numbers and get only month name
            const month = date.replace(/[0-9]|\./gi, "").trim();
            let monthNumber = monthsArr.indexOf(month) + 1;

            // Change order of numbers for later date initialization
            date = date.replace(month, monthNumber + ".")
                .replace(/([0-9]+\. )([0-9]+\. )([0-9]+)/gi, "$3-$2-$1")
                .replace(/\. | /g, "");
            console.log("Date after parsing: ", date);

            // Create date object from retrieved date on website
            let dateObj = new Date(date);
            console.log("Date object: ", dateObj);

            // If files don't exist or if date is newer than latest saved date, update files
            if (dateObj >= savedDate || !fs.existsSync(zipFile)) {
                console.log("Update files");

                savedDate = dateObj;

                // Date string for gpx points file name in zip
                const dateString = dateObj.getFullYear() + "-" + ("0" + (dateObj.getMonth() + 1)).slice(-2) + "-" + ("0" + dateObj.getDate()).slice(-2);

                // Delete all downloaded files if exist
                if (fs.existsSync(zipFile)) {
                    try {
                        fs.unlinkSync(zipFile);
                        fs.unlinkSync(gpxFile);
                    } catch (e) {
                    }
                }

                const file = fs.createWriteStream(zipFile);
                // Download zip file
                http.get(firstLink, function (response) {
                    console.log("Read files");
                    response.pipe(file);

                    // Unzip file and get gpx points
                    file.on('finish', function () {
                        console.log("Got files");

                        try {
                            const zip = new AdmZip(zipFile);
                            //zip.extractAllTo("downloads",true);

                            // Read zipped gpx points into our file
                            fs.writeFileSync(gpxFile, zip.readAsText(`STKP_${dateString}.gpx`));
                            callback(true);
                        } catch (e) {
                            callback(false, e);
                        }
                    });
                }).on('error', function (err) { // Handle errors
                    callback(false, err);
                });
            } else if (dateObj < savedDate) {
                console.log("Already have latest files");

                savedDate = dateObj;

                callback(true);
            }
        })
        .catch(function (error) {
            //console.log(error);
            callback(false, error);
        });
}

// Export function and gpx file name
module.exports = {
    checkForDate,
    gpxFile
};
