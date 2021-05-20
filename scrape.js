const axios = require('axios');
const cheerio = require('cheerio');
const request = require('request');
const fs = require('fs');
const AdmZip = require('adm-zip');

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
    let latest_kt_link;
    let stkp_date;

    // init empty array to store etape data into
    const etape = [];

    let update = false;

    // ============================== Scraping website ==============================
    await axios(etapeUrl, {timeout: 60000}) // timeout after 1 min
        .then(response => {
            // Get html code
            const html = response.data;
            const $ = cheerio.load(html);

            // ============================== find download links ==============================
            // Get all urls with gpx files
            const links = $('h3 > strong');

            console.log(links[0].children[1].attribs["href"]);

            // this could change, but it has never been updated before
            latest_kt_link = links[0].children[1].attribs["href"];
            // ==============================/ find download links==============================

            // ============================== creating etape json with information for each "etapa" ==============================
            // get table that contains the etape
            const etapeTable = $('#posts-table-1 > tbody > tr');

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
            // ==============================/ creating etape json with information for each "etapa" ==============================

            // ============================== get latest update dates ==============================
            // Get paragraphs immediately preceded by div for latest date
            const allP = $('h3 ~ p');
            const firstP = allP[0].children[0].data;
            stkp_date = firstP.replace(/\(nova verzija GPX datotek |\)/gi, "");
            console.log("Date from website: ", stkp_date);

            // get month
            // Delete numbers and get only month name
            const month = stkp_date.replace(/[0-9]|\./gi, "").trim();
            let monthNumber = monthsArr.indexOf(month) + 1;

            // add a leading zero if less than 10
            if (monthNumber < 10) monthNumber = "0" + String(monthNumber);

            // get year
            let year = stkp_date.split(" ").pop();
            // get day
            let day = "01";
            // add a leading zero if only one number
            if (day.length < 2) day = "0" + day;

            stkp_date = day + "-" + monthNumber + "-" + year
            let stkp_date_number = parseInt(year + monthNumber + day);
            console.log("Date after parsing: ", stkp_date);
            console.log("Datenumber: ", stkp_date_number);

            const zip_file_name = check_if_zip_exists();
            let zip_date_number;
            if (zip_file_name) {
                zip_date_number = zip_file_name.split("_")[1].split(".")[0];
                const nums = zip_date_number.split("-");
                zip_date_number = parseInt(nums[2] + nums[1] + nums[0]);
            }

            // If zip doesn't exist or if its date is older than date on the webpage, update files
            if (!zip_file_name || zip_date_number < stkp_date_number) {
                update = true;
            }
            // ==============================/ get latest update dates ==============================
        })
        .catch(function (error) {
            console.log(error);
        });

    // ==============================/ Scraping website ==============================

    // ============================== updating files ==============================
    if (update) {
        try {
            // clean the downloads directory
            delete_downloads();

            console.log("Goto download kt");
            const ktBack = await getKontrolneTockeJson();

            console.log(ktBack);

            // download kt
            //await download_file(latest_kt_link, "KT.gpx");

            //loop over links in json
            for (let i = 0; i < etape.length; i++) {
                // scrape page for gpx href
                const dl_link = await visit_etapa_and_get_link(etape[i].href);
                // download the gpx and put it into json
                etape[i].file = await download_file(dl_link, `Etapa_${i + 1}.gpx`);
            }

            // finally write the file as json
            fs.writeFileSync(dl_location + 'etape.json', JSON.stringify(etape));

            console.log("etape.json created");

            // zip the entire downloads directory
            const zip_success = zip_downloads(stkp_date);
            if (zip_success === true) {
                callback(true);
            } else {
                callback(false, zip_success);
            }
        } catch (error) {
            console.log(error);
            callback(false, error);
        }
    } else {
        console.log("Files already up to date :)");

        callback(true);
    }
    // ==============================/ updating files ==============================
}

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

function zip_downloads(date) {
    try {
        let zip = new AdmZip();

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
function delete_downloads() {
    try {
        const downloads = fs.readdirSync(dl_location);
        for (let i = 0; i < downloads.length; i++) {
            if(downloads[i] === "KT.gpx"){
                continue;
            }

            fs.unlinkSync(dl_location + downloads[i]);
        }

        return true;
    } catch (error) {
        return error;
    }
}

function check_if_zip_exists() {
    const filenames = fs.readdirSync(dl_location);
    for (let i = 0; i < filenames.length; i++) {
        if (filenames[i].startsWith("ZIP_")) {
            return filenames[i];
        }
    }

    return false;
}

/**
 * Scrape etapa (of provided link) and return the gpx file download href
 * @param {String} etapa_link // link to etapa webpage
 */

async function visit_etapa_and_get_link(etapa_link) {
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
function download_file(link, name) {
    return new Promise((resolve, reject) => {
        try {
            console.log("Downloading " + link);

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
                        // just skip for now...
                        // http://pzs.si/ktk/wpstkp/download/978/ throws Error:  Parse Error: Expected HTTP/

                        resolve("error");
                        //reject(err);
                    }

                    // get filename from response header
                    const dl_filename = res.headers['content-disposition'].split("\"")[1];

                    // check if zip
                    if (dl_filename.split(".").pop().toLowerCase() === 'zip') {
                        // unzip
                        let zip = new AdmZip(body);

                        // only first file... hopefully no one puts multiple gpx files in a zip lol
                        body = zip.readAsText(zip.getEntries()[0]);
                    }

                    let actual_filename = dl_filename.slice(0, -4) + '.gpx';

                    // if we provided a name as a function parameter, use that name instead
                    if (name) {
                        actual_filename = name;
                    }

                    // save the downloaded file
                    fs.writeFileSync(dl_location + actual_filename, body);
                    //console.log("Finished writing " + actual_filename);
                    resolve(actual_filename);
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
 */
function get_full_filename(filename) {
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
 */
function get_date_number(filename) {
    let file = get_full_filename(filename);
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
    get_full_filename,
    get_date_number
};
