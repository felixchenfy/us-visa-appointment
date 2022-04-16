const puppeteer = require('puppeteer');
const parseArgs = require('minimist');

(async () => {
    //#region Command line args
    const args = parseArgs(process.argv.slice(2))
    const currentDate = new Date(args.d);
    const usernameInput = args.u;
    const passwordInput = args.p;
    const appointmentId = args.a;
    const retryTimeout = args.t * 1000;
    const consularId = JSON.stringify(args.c);
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
    //#endregion

    async function runLogic() {
      //#region Init puppeteer
      const browser = await puppeteer.launch();
      // Comment above line and uncomment following line to see puppeteer in action
      // const browser = await puppeter.launch({ headless: false });
      const page = await browser.newPage();
      const timeout = 5000;
      const smallTimeout = 100;
      page.setDefaultTimeout(timeout);
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
          const promises = [];
          promises.push(targetPage.waitForNavigation());
          await targetPage.goto('https://ais.usvisa-info.com/en-ca/niv/users/sign_in');
          await Promise.all(promises);
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
          const element = await waitForSelectors([["#new_user > div.radio-checkbox-group.margin-top-30 > label > div"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          await element.click({ offset: { x: 9, y: 16.34375} });
      }
      
      // Click login button
      {
          const targetPage = page;
          const promises = [];
          promises.push(targetPage.waitForNavigation());
          const element = await waitForSelectors([["aria/Sign In[role=\"button\"]"],["#new_user > p:nth-child(9) > input"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          await element.click({ offset: { x: 34, y: 11.34375} });
          await Promise.all(promises);
      }

      // We are logged in now. Check available dates from the API
      {
          const targetPage = page;
          const promises = [];
          promises.push(targetPage.waitForNavigation());
          const response = await targetPage.goto('https://ais.usvisa-info.com/en-ca/niv/schedule/' + appointmentId + '/appointment/days/' + consularId + '.json?appointments[expedite]=false');
          await Promise.all(promises);

          const availableDates = JSON.parse(await response.text());

          if (availableDates.length <= 0) {
            console.log("There are no available dates for consulate with id " + consularId);
            await browser.close();
            return false;
          }

          const firstDate = new Date(availableDates[0].date);

          if (firstDate > currentDate) {
            console.log("There is not an earlier date available than " + currentDate.toISOString().slice(0,10));
            await browser.close();
            return false;
          }

          console.log("Found an earlier date! " + firstDate.toISOString().slice(0,10));
      }    

      // Go to appointment page
      {
          const targetPage = page;
          const promises = [];
          promises.push(targetPage.waitForNavigation());
          await targetPage.goto('https://ais.usvisa-info.com/en-ca/niv/schedule/35973458/appointment');
          await Promise.all(promises);
      }    

      // Select the specified consular from the dropdown
      {
          const targetPage = page;
          const element = await waitForSelectors([["aria/Consular Section Appointment","aria/[role=\"combobox\"]"],["#appointments_consulate_appointment_facility_id"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);    
          await page.select("#appointments_consulate_appointment_facility_id", consularId);
      }

      // Click on date input
      {
          const targetPage = page;
          const element = await waitForSelectors([["aria/Date of Appointment *"],["#appointments_consulate_appointment_date"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          await element.click({ offset: { x: 394.5, y: 17.53125} });
      }

      // Keep clicking next button until we find the first available date and click to that date
      {
          const targetPage = page;
          while (true) {
            try {
              const element = await waitForSelectors([["aria/25[role=\"link\"]"],["#ui-datepicker-div > div.ui-datepicker-group.ui-datepicker-group-last > table > tbody > tr > td.undefined > a"]], targetPage, { timeout:smallTimeout, visible: true });
              await scrollIntoViewIfNeeded(element, timeout);
              await page.click('#ui-datepicker-div > div.ui-datepicker-group.ui-datepicker-group-last > table > tbody > tr > td.undefined > a');
              break;
            } catch (err) {
              {
                  const targetPage = page;
                  const element = await waitForSelectors([["aria/Next","aria/[role=\"generic\"]"],["#ui-datepicker-div > div.ui-datepicker-group.ui-datepicker-group-last > div > a > span"]], targetPage, { timeout, visible: true });
                  await scrollIntoViewIfNeeded(element, timeout);
                  await element.click({ offset: { x: 4, y: 9.03125} });
              }
            }
          }
      }

      // Select the first available Time from the time dropdown
      {
          const targetPage = page;
          const element = await waitForSelectors([["#appointments_consulate_appointment_time"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          await new Promise(resolve => setTimeout(resolve, 500));
          await page.evaluate(() => {
            document.querySelector('#appointments_consulate_appointment_time option:nth-child(2)').selected = true;
            const event = new Event('change', {bubbles: true});
            document.querySelector('#appointments_consulate_appointment_time').dispatchEvent(event);
          })
      }

      // Click on reschedule button
      {
          const targetPage = page;
          const element = await waitForSelectors([["aria/Reschedule"],["#appointments_submit"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          await element.click({ offset: { x: 78.109375, y: 20.0625} });
      }

      // Click on submit button on the confirmation popup
      {
        const targetPage = page;
        const element = await waitForSelectors([["aria/Cancel"],["body > div.reveal-overlay > div > div > a.button.alert"]], targetPage, { timeout, visible: true });
        await scrollIntoViewIfNeeded(element, timeout);
        await page.click('body > div.reveal-overlay > div > div > a.button.alert');
      }

      await browser.close();
      return true;
      //#endregion
    }

    while (true){
      const result = await runLogic();

      if (result){
        console.log("Successfully scheduled a new appointment");
        break;
      }

      await new Promise(resolve => setTimeout(resolve, retryTimeout));
    }
})();