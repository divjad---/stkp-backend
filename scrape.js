const axios = require('axios');
const cheerio = require('cheerio');
const request = require('request');
const fs = require('fs');
var AdmZip = require('adm-zip');
const { resolve } = require('path');

const url = 'https://pzs.si/ktk/wpstkp/pregled-etap/';

// Array with months for replacing word with number
const monthsArr = ["januar", "februar", "marec", "april", "maj", "junij", "julij",
    "avgust", "september", "oktober", "november", "december"];

//Init variable so its not null at startup
let savedDate = new Date();



// Path and names of files
const dl_location = "downloads/";

// "etape" is referred to as "et" and "kontrolne tocke" is referred to as "kt"



/**
 * Scrape website and download files if necessary
 * @param callback
 */
const checkForDate = async function checkForDate(callback) {

	var latest_et_link;
	var latest_kt_link;
	var stkp_date_number;
	
	// ============================== Scraping website ==============================
	await axios(url, {timeout: 60000}) // timeout after 1 min
        .then(response => {
            // Get html code
            const html = response.data;
            const $ = cheerio.load(html);

			// ============================== find download links ==============================
            // Get all urls with gpx files
            const links = $('h3 > strong');
            latest_et_link = links[0].children[1].attribs["href"];
			// this could change, but it has never been updated before
            latest_kt_link = links[3].children[1].attribs["href"];
			// ==============================/ find download links==============================

			// ============================== get update dates ==============================
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

			/**
			 * Stitch together a number representing time of the files
			 * 2019 + 09 + 03 = 20190903
			 * if that date changes to 2021-11-01 for example
			 * you can simply compare 20190903 to 20211101 and update 
			 */
			stkp_date_number = date.replace(month, monthNumber + ".");
			const nums = stkp_date_number.split("-");
			if (parseInt(nums[1]) < 10) nums[1] = "0" + nums[1];
			if (parseInt(nums[2]) < 10) nums[2] = "0" + nums[2];
			stkp_date_number = parseInt(nums[0] + nums[1] + nums[2]);
			// ==============================/ get update dates ==============================

        })
        .catch(function (error) {
			//console.log(error);
            callback(false, error);
        });

	// ==============================/ Scraping website ==============================
	
	// ============================== updating files ==============================
	try {
		// update "etape" gpx file
		await updateET(latest_et_link, stkp_date_number);
		console.log("ET successfuly updated");

		// update "kontrolne tocke" gpx file
		// 20160615 is the latest update date for KT files on STKP site
		await updateKT(latest_kt_link, 20160615);
		console.log("KT successfuly updated");

		await createZip(get_latest_date());
		console.log("ZIP successfuly updated");


		callback(true);
	} catch (error) {
		callback(false, error);
		return;
	}
	// ==============================/ updating files ==============================
	
		
}



function get_latest_date() {

	var latest_date_number = 0;
	var latest_date_string = "";

	files = fs.readdirSync(dl_location);
	for (var i = 0; i < files.length; i++ ){
		if (files[i].endsWith(".gpx")) {
			const date_string = files[i].split(/_|\./)[1];
			const date_number = parseInt(date_string.split("-").join(""));
			if (date_number > latest_date_number) {
				latest_date_number = date_number;
				latest_date_string = date_string;
			}
		}
	}
	return latest_date_string;
}


/**
 * Checks downloads directory and returns a file which
 * name begins with the passed string parameter filename
 * If no such files found, returns false
 */
function get_full_filename(filename) {
	files = fs.readdirSync(dl_location);
	for (var i = 0; i < files.length; i++ ){
		if (files[i].startsWith(filename)) {
			return files[i];
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

	file = get_full_filename(filename);
	// if no such file found, return false
	if (!file) return false;
	// if found, extract date and create a number
	var date = file.split(/_|\./)[1];
	return parseInt(date.split("-").join(""));
}

/**
 * Reads date from filename of "etape" gpx file and compares
 * it to the one from server. If "etape" file doesn't exist yet
 * or is outdated, function then downloads "etape" zip, unzips in memory
 * and saves as "ET_date.gpx"
 */
function updateET(link, stkp_latest_date) {
	return new Promise((resolve, reject) => { 
		try {
			// get date number from file starting with "ET"
			const latest_date = get_date_number("ET");
			// if "etape" file doesnt exist yet or is outdated then proceed
			if (!latest_date || stkp_latest_date > latest_date) {
				console.log("updating ET");
	
				// delete the ET gpx file if exsits
				if (latest_date) {
					fs.unlinkSync(dl_location + get_full_filename("ET"));
				}
				// download new file
				request.get({url: link, encoding: null}, (err, res, body) => {
					try {
						// read the downloaded zip file
						var zip = new AdmZip(body);
						var zipEntries = zip.getEntries();
						// loop over zipped files
						for (var i = 0; i < zipEntries.length; i++) {
							// if found one which name starts with "STKP", create a name and unzip it
							if (zipEntries[i].entryName.startsWith("STKP")) {
								// create filename "ET_year-month-day.gpx"
								filename = "ET_" + zipEntries[i].entryName.split("_")[1];
								// write the file
								fs.writeFileSync(dl_location + filename, zip.readAsText(zipEntries[i]))
								console.log("Done writing ET\n");
								resolve(true);

							}
						}
						
					} catch (error) {
						reject(error);
						
					}
				});
			} else {
				// files up to date already
				resolve(true);
			}

		} catch (error) {
			reject(error);
		}
		
	});
}

/**
 * Reads date from filename of "kontrolne tocke" gpx file and compares
 * it to the one from STKP site. If "kontrolne tock" file doesn't exist yet
 * or is outdated, function then downloads "kontrolne tocke" gpx
 * and saves as "KT_date.gpx"
 */
function updateKT(link, stkp_latest_date) {
	return new Promise((resolve, reject) => { 
		try {
			const latest_date = get_date_number("KT");
	
			// if "kontrolne tocke" file doesnt exist yet or is outdated then proceed
			if (!latest_date || stkp_latest_date > latest_date) {
				console.log("updating KT");
		
				// delete the ET gpx file if exsits
				if (latest_date) {
					fs.unlinkSync(dl_location + get_full_filename("KT"));
				}
				// download new file
				request.get({url: link, encoding: null}, (err, res, body) => {
					try {
						// get filename from response header
						const dl_filename = res.headers['content-disposition'].split("\"")[1];
						// extract date from filename
						var date = dl_filename.split("_")[1];
						const filename = "KT_" + date + ".gpx";
						// save the downloaded file
						fs.writeFileSync(dl_location + filename, body)
						console.log("done writing KT\n");
						resolve(true);
						
					} catch (error) {
						reject(error);
					}
			
				});
					
			}else {
				// files up to date already
				resolve(true);
			}
		} catch (error) {
			reject(error);
		}
	// get date number from file starting with "ET"
	})

}

/**
 * Creates the zip of both gpx files named as 
 * "ZIP_date.zip" where date is the "latest_date"
 * passed into function as a parameter. It should be
 * the newest date of both ET and KT files
 */

function createZip(latest_date) {
	return new Promise((resolve, reject) => { 
		try {
			// create a date number from the passed date string
			const latest_date_number = parseInt(latest_date.split("-"));
			// get date number from the ZIP file name
			const zip_date_number = get_date_number("ZIP");
			// if zip file doesnt exist or is outdated, proceed
			if(!zip_date_number || latest_date_number > zip_date_number) {
				console.log("Updating Zip");
				// if already exists, delete
				if (zip_date_number) {
					fs.unlinkSync(dl_location + get_full_filename("ZIP"));	
				}

				zip = new AdmZip();
				zip.addLocalFile(dl_location + get_full_filename("ET"));
				zip.addLocalFile(dl_location + get_full_filename("KT"));
				zip.writeZip(dl_location + "ZIP_" + latest_date + ".zip");
				console.log("Done writing Zip\n");
				resolve(true);
			} else {
				// files up to date already
				resolve(true);
			}
			
		} catch (error) {
			reject(error);
		}
	});
}




// Export function and gpx file name
module.exports = {
    checkForDate,
	dl_location,
	get_full_filename,
	get_date_number
};
