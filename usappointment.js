const puppeteer = require('puppeteer');
const parseArgs = require('minimist');
const axios = require('axios');

(async () => {
    //#region Command line args
    const args = parseArgs(process.argv.slice(2), {string: ['u', 'p', 'c', 'a', 'n', 'd', 'r'], boolean: ['g', 'b']})
    const expectedDate = new Date(args.d);
    const usernameInput = args.u;
    const passwordInput = args.p;
    const appointmentId = args.a;
    const retryTimeout = args.t * 1000;
    // const consularId = args.c;
    const userToken = args.n;
    const groupAppointment = args.g;
    const region = args.r;
    const runInBackground = args.b; // pass -b to run in background.
    //#endregion
	
    //#region Helper functions
    async function waitForSelectors(selectors, frame, options) {
      for (const selector of selectors) {
        try {
          return await waitForSelector(selector, frame, options);
        } catch (err) {
        }
      }
      throw new Error('Could not find element for selectors: ' + JSON.stringify(selectors));
    }

    async function scrollIntoViewIfNeeded(element, timeout) {
      await waitForConnected(element, timeout);
      const isInViewport = await element.isIntersectingViewport({threshold: 0});
      if (isInViewport) {
        return;
      }
      await element.evaluate(element => {
        element.scrollIntoView({
          block: 'center',
          inline: 'center',
          behavior: 'auto',
        });
      });
      await waitForInViewport(element, timeout);
    }

    async function waitForConnected(element, timeout) {
      await waitForFunction(async () => {
        return await element.getProperty('isConnected');
      }, timeout);
    }

    async function waitForInViewport(element, timeout) {
      await waitForFunction(async () => {
        return await element.isIntersectingViewport({threshold: 0});
      }, timeout);
    }

    async function waitForSelector(selector, frame, options) {
      if (!Array.isArray(selector)) {
        selector = [selector];
      }
      if (!selector.length) {
        throw new Error('Empty selector provided to waitForSelector');
      }
      let element = null;
      for (let i = 0; i < selector.length; i++) {
        const part = selector[i];
        if (element) {
          element = await element.waitForSelector(part, options);
        } else {
          element = await frame.waitForSelector(part, options);
        }
        if (!element) {
          throw new Error('Could not find element: ' + selector.join('>>'));
        }
        if (i < selector.length - 1) {
          element = (await element.evaluateHandle(el => el.shadowRoot ? el.shadowRoot : el)).asElement();
        }
      }
      if (!element) {
        throw new Error('Could not find element: ' + selector.join('|'));
      }
      return element;
    }

    async function waitForFunction(fn, timeout) {
      let isActive = true;
      setTimeout(() => {
        isActive = false;
      }, timeout);
      while (isActive) {
        const result = await fn();
        if (result) {
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Timed out');
    }

    async function sleep(timeout) {
      return await new Promise(resolve => setTimeout(resolve, timeout));
    }

    async function log(msg) {
      const expectedDate = '[' + new Date().toLocaleString() + ']';
      // console.log doesn't print to the console :(
      console.warn(expectedDate, msg);
    }

    async function notify(msg) {
      log(msg);

      if (!userToken) {
        return;
      }

      const pushOverAppToken = 'a5o8qtigtvu3yyfaeehtnzfkm88zc9';
      const apiEndpoint = 'https://api.pushover.net/1/messages.json';
      const data = {
        token: pushOverAppToken,
        user: userToken,
        message: msg
      };

      await axios.post(apiEndpoint, data);
    }
    //#endregion
    
    // Configurations:
    let page;
    let browser;
    const timeout = 3000;
    const navigationTimeout = 10000;
    const smallTimeout = 100;
    let sleep_ratio = 1;

    async function runLogic(consularId, do_login) {
      if (do_login) {
      if (runInBackground) {
        browser = await puppeteer.launch();
      } else {
        // Open a browser to show the steps. 
        browser = await puppeteer.launch({ headless: false });
        sleep_ratio = 3;
      }
      page = await browser.newPage();

      page.setDefaultTimeout(timeout);
      page.setDefaultNavigationTimeout(navigationTimeout);
      //#endregion
        
      //#region Logic
      
      // Set the viewport to avoid elements changing places 
      {
          const targetPage = page;
          await targetPage.setViewport({"width":2078,"height":1479})
      }

      // Go to login page
      {
          const targetPage = page;
          await targetPage.goto('https://ais.usvisa-info.com/en-' + region + '/niv/users/sign_in', { waitUntil: 'domcontentloaded' });
      }

      // Click on username input
      {
          const targetPage = page;
          const element = await waitForSelectors([["aria/Email *"],["#user_email"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          await element.click({ offset: { x: 118, y: 21.453125} });
      }

      // Type username
      {
          const targetPage = page;
          const element = await waitForSelectors([["aria/Email *"],["#user_email"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          const type = await element.evaluate(el => el.type);
          if (["textarea","select-one","text","url","tel","search","password","number","email"].includes(type)) {
            await element.type(usernameInput);
          } else {
            await element.focus();
            await element.evaluate((el, value) => {
              el.value = value;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }, usernameInput);
          }
      }
    
      // Hit tab to go to the password input
      {
          const targetPage = page;
          await targetPage.keyboard.down("Tab");
      }
      {
          const targetPage = page;
          await targetPage.keyboard.up("Tab");
      }
    
      // Type password
      {
          const targetPage = page;
          const element = await waitForSelectors([["aria/Password"],["#user_password"]], targetPage, { timeout, visible: true });
      await scrollIntoViewIfNeeded(element, timeout);
          const type = await element.evaluate(el => el.type);
          if (["textarea","select-one","text","url","tel","search","password","number","email"].includes(type)) {
            await element.type(passwordInput);
          } else {
            await element.focus();
            await element.evaluate((el, value) => {
              el.value = value;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }, passwordInput);
          }
      }
    
      // Tick the checkbox for agreement
      {
          const targetPage = page;
          const element = await waitForSelectors([["#sign_in_form > div.radio-checkbox-group.margin-top-30 > label > div"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          await element.click({ offset: { x: 9, y: 16.34375} });
      }
      
      // Click login button
      {
          const targetPage = page;
          const element = await waitForSelectors([["aria/Sign In[role=\"button\"]"],["#new_user > p:nth-child(9) > input"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          await element.click({ offset: { x: 34, y: 11.34375} });
          await targetPage.waitForNavigation();
      }

        // Go to appointment page
        {
            const targetPage = page;
            await targetPage.goto('https://ais.usvisa-info.com/en-' + region + '/niv/schedule/' + appointmentId + '/appointment', { waitUntil: 'domcontentloaded' });
            await sleep(sleep_ratio * 500);
        }     

        // Select multiple people if it is a group appointment
        {
            if(groupAppointment){
              const targetPage = page;
              const element = await waitForSelectors([["aria/Continue"],["#main > div.mainContent > form > div:nth-child(3) > div > input"]], targetPage, { timeout, visible: true });
              await scrollIntoViewIfNeeded(element, timeout);
              await element.click({ offset: { x: 70.515625, y: 25.25} });
              await sleep(sleep_ratio * 500);
            }
        }
      }

      // Select the specified consular from the dropdown
      {
          const targetPage = page;
          const element = await waitForSelectors([["aria/Consular Section Appointment","aria/[role=\"combobox\"]"],["#appointments_consulate_appointment_facility_id"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);    
          await page.select("#appointments_consulate_appointment_facility_id", consularId);
          await sleep(sleep_ratio * 500);
      }

      // Click on date input
      try {
          const targetPage = page;
          const element = await waitForSelectors([["aria/Date of Appointment *"],["#appointments_consulate_appointment_date"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          await element.click({ offset: { x: 394.5, y: 17.53125} });
          await sleep(sleep_ratio * 300);
      } catch (error){
        // If there are no openings at all, the above logic will
        // be stuck for a few seconds and throw error.
        // Let's close the browser and rethrow error.
        console.error("Failed to open calendar, probably because there is no available appointment.");
        await sleep(sleep_ratio * 500);
        return false;
      }

      // Keep clicking next button until we find the first available date and click to that date
      let num_clicks = 0;
      {
          const targetPage = page;
          while (true) {
            try {
              const element = await waitForSelectors([["aria/25[role=\"link\"]"],["#ui-datepicker-div > div.ui-datepicker-group.ui-datepicker-group > table > tbody > tr > td.undefined > a"]], targetPage, { timeout:smallTimeout, visible: true });
              await scrollIntoViewIfNeeded(element, timeout);
              await page.click('#ui-datepicker-div > div.ui-datepicker-group.ui-datepicker-group > table > tbody > tr > td.undefined > a');
              await sleep(sleep_ratio * 200);
              break;
            } catch (err) {
              {
                  num_clicks++;
                  const targetPage = page;
                  const element = await waitForSelectors([["aria/Next","aria/[role=\"generic\"]"],["#ui-datepicker-div > div.ui-datepicker-group.ui-datepicker-group-last > div > a > span"]], targetPage, { timeout, visible: true });
                  await scrollIntoViewIfNeeded(element, timeout);
                  await element.click({ offset: { x: 4, y: 9.03125} });
              }
            }
          }
      }
      
      // Use the number of clicks to deduce the month of the next available slot.
      // If today is April, and num_clicks=1, then the next available
      // opening is in May or June.
      //
      // BIG WARNING1:
      // This approach has a 1-month error --- If you enter the expected date of (m=X,d=Y),
      // the program selects extra days between (m=X,d=Y) to (m=X,d=31).
      if (num_clicks == 0) {
        // WARNING: Feiyu added the following logic to avoid making appointment
        // within 2 months. Feel free to delete this if logic if it doesn't fit your need.
        notify("Found a date in the next two months! num_clicks == 0");
        notify("However, that's too early and I don't like it.");
        await sleep(sleep_ratio * 300);
        return false;
      } else {
        // returns the first date of the month that is X months from now
        function getFirstDateAfterXMonths(x) {
          const currentDate = new Date();
          const currentMonth = currentDate.getMonth();
          const targetMonth = currentMonth + x;
          const targetYear = currentDate.getFullYear() + Math.floor(targetMonth / 12);
          const firstDate = new Date(targetYear, targetMonth % 12, 1);
          return firstDate;
        }
        const firstDate = getFirstDateAfterXMonths(num_clicks + 1);
        if (firstDate <= expectedDate) {
          notify("Found an earlier date! " + firstDate.toISOString().slice(0,10));
        } else {
          function getYearAndMonth(date) {
            return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
          }
          log("No desired date. The earlist date is in month: " + getYearAndMonth(firstDate));
          await sleep(sleep_ratio * 300);
          return false;
        }
      }

      // Select the first available Time from the time dropdown
      {
          const targetPage = page;
          const element = await waitForSelectors([["#appointments_consulate_appointment_time"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          await page.evaluate(() => {
            document.querySelector('#appointments_consulate_appointment_time option:nth-child(2)').selected = true;
            const event = new Event('change', {bubbles: true});
            document.querySelector('#appointments_consulate_appointment_time').dispatchEvent(event);
          })
          await sleep(sleep_ratio *1000);
      }

      // Click on reschedule button
      log("Good news! Click on reschedule button");
      {
          const targetPage = page;
          const element = await waitForSelectors([["aria/Reschedule"],["#appointments_submit"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          await element.click({ offset: { x: 78.109375, y: 20.0625} });
          await sleep(sleep_ratio *1000);
      }

      // Click on submit button on the confirmation popup
      log("Good news! Click on submit button on the confirmation popup");
      {
        const targetPage = page;
        const element = await waitForSelectors([["aria/Cancel"],["body > div.reveal-overlay > div > div > a.button.alert"]], targetPage, { timeout, visible: true });
        await scrollIntoViewIfNeeded(element, timeout);
        await page.click('body > div.reveal-overlay > div > div > a.button.alert');
        await sleep(sleep_ratio * 5000);
      }

      log("Good news! Successfully booked the appointment");
      return true;
      //#endregion
    }
    const consularIds = ["89", "90", "91", "92", "93", "94", "95"];
    // const consularIds = ["95"];
    found_appointment = false;
    while (!found_appointment){
      // -c Consular id. Halifax 90, Montreal 91, Ottowa 92, Quebec City 93, Toronto 94, Vancouver is 95 for Canada. You can find ids for other consulates from the dropdown values in the appointment page.
      // 93 94 gives no result
      log("------------------------------------------------");
      for(let i = 0; i < consularIds.length; i++) {
        log("Try consularId: " + consularIds[i])
        try{
          let do_login = i == 0;
          const result = await runLogic(consularIds[i], do_login);
          if (result){
            notify("Successfully scheduled a new appointment");
            found_appointment = true;
            break;
          }
        } catch (err){
          // Swallow the error and keep running in case we encountered an error.
          console.error(err.message.split('\n')[0]);
        }
        await sleep(1000);
    }
      await browser.close();
      log("------------------------------------------------");
      await sleep(retryTimeout);
    }
})();
