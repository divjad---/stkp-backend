const axios = require('axios');
const cheerio = require('cheerio');

const http = require('http'); // or 'https' for https:// URLs
const fs = require('fs');
var AdmZip = require('adm-zip');

const url = 'https://pzs.si/ktk/wpstkp/pregled-etap/';

const monthsArr = ["januar", "februar", "marec", "april", "maj", "junij", "julij",
    "avgust", "september", "oktober", "november", "december"];

let savedDate = new Date();

const zipFile = "downloads/file.zip";
const gpxFile = "downloads/test.gpx";

const checkForDate = function checkForDate(callback) {
    axios(url)
        .then(response => {
            const html = response.data;
            const $ = cheerio.load(html);
            const links = $('h3 > strong');
            const firstLink = links[0].children[1].attribs["href"];

            const allP = $('h3 ~ p');
            const firstP = allP[0].children[0].data;
            let date = firstP.replace(/\(nova verzija GPX datotek |\)/gi, "");
            console.log("Date from website: ", date);

            const month = date.replace(/[0-9]|\./gi, "").trim();
            let monthNumber = monthsArr.indexOf(month) + 1;

            date = date.replace(month, monthNumber + ".")
                .replace(/([0-9]+\. )([0-9]+\. )([0-9]+)/gi, "$3-$2-$1")
                .replace(/\. | /g, "");
            console.log("Date after parsing: ", date);

            let dateObj = new Date(date);
            console.log("Date object: ", dateObj);

            if (dateObj >= savedDate || !fs.existsSync(zipFile)) {
                console.log("Update files");

                savedDate = dateObj;

                const dateString = dateObj.getFullYear() + "-" + ("0" + (dateObj.getMonth() + 1)).slice(-2) + "-" + ("0" + dateObj.getDate()).slice(-2);

                if (fs.existsSync(zipFile)) {
                    try {
                        fs.unlinkSync(zipFile);
                        fs.unlinkSync(gpxFile);
                    } catch (e) {
                    }
                }

                const file = fs.createWriteStream(zipFile);
                http.get(firstLink, function (response) {
                    console.log("Read files");
                    console.log(response.statusCode);
                    response.pipe(file);

                    file.on('finish', function () {
                        console.log("Got files");

                        try {
                            const zip = new AdmZip(zipFile);
                            //zip.extractAllTo("downloads",true);

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

module.exports = {
    checkForDate,
    gpxFile
};
