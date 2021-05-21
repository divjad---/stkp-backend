const axios = require('axios');
const admZip = require('adm-zip');
const cheerio = require('cheerio');
const request = require('request');
const fs = require('fs');

// Urls for scraping html
const etapeUrl = 'https://stkp.pzs.si/pregled-etap/';
const kontrolneTockeUrl = 'https://stkp.pzs.si/kontrolne-tocke/';

// Array with months for replacing word with number
const monthsArr = ["januar", "februar", "marec", "april", "maj", "junij", "julij",
    "avgust", "september", "oktober", "november", "december"];

// Path and names of files
const dl_location = "downloads/";

// "etape" is referred to as "et" and "kontrolne tocke" is referred to as "kt"

/**
 * Scrape website and download files if necessary
 * @param callback
 */
const checkForDate = async function checkForDate(callback) {
    let stkpDate;

    // init empty array to store etape data into
    let etape = [];

    let update = false;

    // ============================== Scraping website ==============================
    await axios(etapeUrl, {timeout: 60000}) // timeout after 1 min
        .then(response => {
            // Get html code
            const html = response.data;
            const $ = cheerio.load(html);

            // Get info about each tour
            etape = getEtape(etape, $);

            // Get date of last gpx file update on webiste
            let date = getWebsiteDate($);

            stkpDate = date.stkpDate;
            console.log("Date after parsing: ", stkpDate);
            console.log("Datenumber: ", date.stkpDateNumber);

            // Get date of zip on server
            let zipDateNumber = getZipDate();

            // If zip doesn't exist or if its date is older than date on the webpage, update files
            if (!zipDateNumber || zipDateNumber < date.stkpDateNumber) {
                update = true;
            }
        })
        .catch(function (error) {
            console.log(error);
        });

    if (update) {
        await updateFiles(etape, stkpDate, callback);
    } else {
        console.log("Files already up to date :)");

        callback(true);
    }
}

/**
 * Update files if necessary
 * @param etape
 * @param stkpDate
 * @param callback
 */
async function updateFiles(etape, stkpDate, callback){
    try {
        // clean the downloads directory
        emptyDownloads();

        console.log("Goto download kt");
        const ktBack = await getKontrolneTockeJson();

        console.log(ktBack);

        //loop over links in json
        for (let i = 0; i < etape.length; i++) {
            // scrape page for gpx href
            const dl_link = await visitEtapaAndGetLink(etape[i].href);
            // download the gpx and put it into json
            etape[i].file = await downloadFile(dl_link, `Etapa_${i + 1}.gpx`);
        }

        // finally write the file as json
        fs.writeFileSync(dl_location + 'etape.json', JSON.stringify(etape));

        console.log("etape.json created");

        // zip the entire downloads directory
        const zip_success = downloadZip(stkpDate);
        if (zip_success === true) {
            callback(true);
        } else {
            callback(false, zip_success);
        }
    } catch (error) {
        console.log(error);
        callback(false, error);
    }
}

/**
 * Get date of files on webiste
 * @param $
 * @returns {{}}
 */
function getWebsiteDate($) {
    const allP = $('h3 ~ p');
    const firstP = allP[0].children[0].data;
    let stkpDate = firstP.replace(/\(nova verzija GPX datotek |\)/gi, "");
    console.log("Date from website: ", stkpDate);

    // get month
    // Delete numbers and get only month name
    const month = stkpDate.replace(/[0-9]|\./gi, "").trim();
    let monthNumber = monthsArr.indexOf(month) + 1;

    // add a leading zero if less than 10
    if (monthNumber < 10) monthNumber = "0" + String(monthNumber);

    // get year
    let year = stkpDate.split(" ").pop();

    // get day
    const day = "01";

    const date = {};
    date.stkpDate = day + "-" + monthNumber + "-" + year;
    date.stkpDateNumber = parseInt(year + monthNumber + day);

    return date;
}

/**
 * Read info about each tour
 * @param $
 */
function getEtape($) {
    const etapeTable = $('#posts-table-1 > tbody > tr');

    const etape = [];

    // loop over each table row
    etapeTable.each((ix, item) => {
        // get all td fields
        const fields = $(item).find('td');

        const naslov = $(fields[0]).find('a').text();
        const href = $(fields[0]).find('a').attr('href');
        const content = $(fields[1]).text();
        const category = $(fields[2]).text();

        // push object into etape array
        etape.push({name: naslov, href: href, desc: content, category: category});
    });

    return etape;
}

/**
 * Get info about each checkpoint and fill json file
 */
function getKontrolneTockeJson() {
    // init empty array to store kt data into
    const kontrolneTocke = [];

    return new Promise((resolve, reject) => {
        axios(kontrolneTockeUrl, {timeout: 60000}) // timeout after 1 min
            .then(response => {
                console.log("Response from kt url");

                // Get html code
                const html = response.data;

                const $ = cheerio.load(html);

                const ktTable = $('#tablepress-3 > tbody > tr');

                // loop over each table row
                ktTable.each((ix, item) => {
                    // get all td fields
                    const fields = $(item).find('td');

                    const zapSt = $(fields[0]).text();
                    const naziv = $(fields[1]).text();
                    const naslov = $(fields[2]).text();
                    const polozajZiga = $(fields[3]).text();

                    const obj = {zapSt: zapSt, naziv: naziv, naslov: naslov, zig: polozajZiga};
                    kontrolneTocke.push(obj);
                });

                fs.writeFileSync(dl_location + "kt.json", JSON.stringify(kontrolneTocke));

                console.log("kt.json created");

                resolve("kt.json created");
            }).catch(function (error) {
            console.log(error);

            reject(error);
        });
    });
}

/**
 * Zips the entire downloads directory as ZIP_date.zip
 * @param {String} date
 */
function downloadZip(date) {
    try {
        let zip = new admZip();

        const downloads = fs.readdirSync(dl_location);
        for (let i = 0; i < downloads.length; i++) {
            zip.addLocalFile(dl_location + downloads[i]);
        }

        zip.writeZip(dl_location + "ZIP_" + date + ".zip");

        return true;
    } catch (error) {
        return error;
    }
}

/**
 * Deletes the contents of downloads directory
 */
function emptyDownloads() {
    try {
        const downloads = fs.readdirSync(dl_location);
        for (let i = 0; i < downloads.length; i++) {
            if (downloads[i] === "KT.gpx") {
                continue;
            }

            fs.unlinkSync(dl_location + downloads[i]);
        }

        return true;
    } catch (error) {
        return error;
    }
}

/**
 * Check if zip file already exists
 * @returns {string|boolean}
 */
function zipExists() {
    const filenames = fs.readdirSync(dl_location);
    for (let i = 0; i < filenames.length; i++) {
        if (filenames[i].startsWith("ZIP_")) {
            return filenames[i];
        }
    }

    return false;
}

/**
 * Get date number of zip file, if exists
 * @returns {boolean|number}
 */
function getZipDate() {
    const zipName = zipExists();

    if (zipName) {
        let zipDateNumber = zipName.split("_")[1].split(".")[0];
        const nums = zipDateNumber.split("-");

        return parseInt(nums[2] + nums[1] + nums[0]);
    }

    return false;
}

/**
 * Scrape etapa (of provided link) and return the gpx file download href
 * @param {String} etapa_link // link to etapa webpage
 */
async function visitEtapaAndGetLink(etapa_link) {
    return new Promise((resolve, reject) => {
        axios(etapa_link, {timeout: 60000})
            .then(response => {
                // Get html code
                const html = response.data;
                const $ = cheerio.load(html);
                const gpx_dl_link = $('#execphp-4 > div.execphpwidget > a').attr('href');
                resolve(gpx_dl_link);
            })
            .catch(function (error) {
                //console.log(error);
                reject(error);
            });
    });
}

/**
 * Downloads the file from a link, checks if its a zip
 * and unzips.. ALWAYS SAVES AS .GPX SO NOT REALLY UNIVERSAL
 * @param {String} link // link to download the file from
 * @param {String} name // Save file as this name.. set null if you want to keep the original
 */
function downloadFile(link, name) {
    return new Promise((resolve, reject) => {
        try {
            console.log("Downloading " + link);

            // Set headers for request
            const options = {
                url: link,
                method: 'GET',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
                    'Accept-Encoding': 'gzip, deflate'
                },
                encoding: null,
                gzip: true
            };

            request.get(options, (err, res, body) => {
                try {
                    if (err) {
                        reject(err);
                    }

                    // get filename from response header
                    const dlFilename = res.headers['content-disposition'].split("\"")[1];

                    // check if zip
                    if (dlFilename.split(".").pop().toLowerCase() === 'zip') {
                        // unzip
                        let zip = new admZip(body);

                        // only first file... hopefully no one puts multiple gpx files in a zip
                        body = zip.readAsText(zip.getEntries()[0]);
                    }

                    let actualFilename = dlFilename.slice(0, -4) + '.gpx';

                    // if we provided a name as a function parameter, use that name instead
                    if (name) {
                        actualFilename = name;
                    }

                    // save the downloaded file
                    fs.writeFileSync(dl_location + actualFilename, body);

                    resolve(actualFilename);
                } catch (error) {
                    reject(error);
                }
            });
        } catch (error) {
            reject(error);
        }
    })
}

/**
 * Checks downloads directory and returns a file which
 * name begins with the passed string parameter filename
 * If no such files found, returns false
 * @param filename
 */
function getFullFilename(filename) {
    let files = fs.readdirSync(dl_location);
    for (let iii = 0; iii < files.length; iii++) {
        if (files[iii].startsWith(filename)) {
            return files[iii];
        }
    }

    return false;
}

/**
 * Checks if the downloads directory contains
 * a file that starts with the provided "filename" and
 * returns the date number, or returns false if file doesn't exist
 * @param filename
 */
function getDateNumber(filename) {
    let file = getFullFilename(filename);
    // if no such file found, return false
    if (!file) return false;

    // if found, extract date and create a number
    let date = file.split(/[_.]/)[1];
    date = date.split("-");

    return parseInt(date[2] + date[1] + date[0]);
}

// Export function and gpx file name
module.exports = {
    checkForDate,
    dl_location,
    getFullFilename,
    getDateNumber
};
