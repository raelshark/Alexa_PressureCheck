'use strict';

var Alexa = require('alexa-sdk');
const config = require('./config');
const AlexaDeviceAddressClient = require('./AlexaDeviceAddressClient');
var Wunderground = require('wundergroundnode');

const APP_ID = config.aws.skillId;

const SKILL_NAME = "Pressure Check";
const GET_PRESSURE_MESSAGE = "The current pressure ";
const LOCATION_CONNECTOR = " in ";
const PRESSURE_CONNECTOR = " is: ";
const HELP_MESSAGE = "You can say 'run pressure check,' you can say 'exit'... What can I help you with?";
const HELP_REPROMPT = "What can I help you with?";
const STOP_MESSAGE = "Goodbye!";
const LOCATION_MESSAGE = "Your location is: ";
const NOTIFY_MISSING_PERMISSIONS = "Please enable Location permissions in the Amazon Alexa app.";
const NO_ADDRESS = "It looks like you don't have an address set. You can set your address from the companion app.";
const ADDRESS_AVAILABLE = "Here is your full address: ";
const ERROR = "Uh Oh. Looks like something went wrong.";
const LOCATION_FAILURE = "There was an error with the Device Address API. Please try again.";
const PRESSURE_UNITS_IN = " inches of mercury ";
const PRESSURE_UNITS_MB = " millibars ";
const PRESSURE_ALT_CONNECTOR = " or ";
const PRESSURE_RISING = " and rising";
const PRESSURE_FALLING = " and falling";

const ALL_ADDRESS_PERMISSION = "read::alexa:device:all:address";
const PERMISSIONS = [ALL_ADDRESS_PERMISSION];

exports.handler = function(event, context, callback) {
  var alexa = Alexa.handler(event, context);
  alexa.appId = APP_ID;
  alexa.registerHandlers(handlers);
  console.log(`Beginning execution for skill with APP_ID=${alexa.appId}`);
  alexa.execute();
  console.log(`Ending execution  for skill with APP_ID=${alexa.appId}`);
};

var handlers = {
  'LaunchRequest': function() {
    console.info("LaunchRequest Called");
    this.emit('GetPressureIntent');
  },
  'AMAZON.HelpIntent': function() {
    var speechOutput = HELP_MESSAGE;
    var reprompt = HELP_REPROMPT;
    this.emit(':ask', speechOutput, reprompt);
  },
  'AMAZON.CancelIntent': function() {
    this.emit(':tell', STOP_MESSAGE);
  },
  'AMAZON.StopIntent': function() {
    this.emit(':tell', STOP_MESSAGE);
  },
  'Unhandled': function() {
    this.emit(':ask', HELP_MESSAGE, HELP_MESSAGE);
  },
  'CurrentPressure': function() {
    this.emit('GetPressureIntent');
  },
  'GetPressureIntent': function() {
    const consentToken = this.event.context.System.user.permissions.consentToken;

    // If we have not been provided with a consent token, this means that the user has not
    // authorized your skill to access this information. In this case, you should prompt them
    // that you don't have permissions to retrieve their address.
    if (!consentToken) {
      this.emit(":tellWithPermissionCard", NOTIFY_MISSING_PERMISSIONS, PERMISSIONS);

      // Lets terminate early since we can't do anything else.
      console.log("User did not give us permissions to access their address.");
      console.info("Ending GetPressureIntent()");
      return;
    }

    const deviceId = this.event.context.System.device.deviceId;
    const apiEndpoint = this.event.context.System.apiEndpoint;

    const alexaDeviceAddressClient = new AlexaDeviceAddressClient(apiEndpoint, deviceId, consentToken);
    let deviceAddressRequest = alexaDeviceAddressClient.getFullAddress();

    var address = null;

    deviceAddressRequest.then((addressResponse) => {
      switch (addressResponse.statusCode) {
        case 200:
          console.log("Address successfully retrieved, now responding to user.");
          address = addressResponse.address;
          console.log(address);
          //const ADDRESS_MESSAGE = ADDRESS_AVAILABLE +
          //`${address['addressLine1']}, ${address['stateOrRegion']}, ${address['postalCode']}`;

          //this.emit(":tell", ADDRESS_MESSAGE);

          if (address) {
            var wunderground = new Wunderground(config.wunderground.apiKey);

            var intent = this;

            wunderground.conditions().request(address.postalCode, function(err, response) {
              console.log("WU response: "+JSON.stringify(response));
              console.log("WU error: "+err);

              var currentPressureIn = response.current_observation.pressure_in;
              var currentPressureMb = response.current_observation.pressure_mb;

              var currentPressureTrend = response.current_observation.pressure_trend;
              var trendMessage = "";

              switch (currentPressureTrend) {
                case "+":
                  trendMessage = PRESSURE_RISING;
                  break;
                case "-":
                  trendMessage = PRESSURE_FALLING;
                  break;
              }

              var speechOutput = GET_PRESSURE_MESSAGE +
                  (address.city ? (LOCATION_CONNECTOR + address.city) : "") +
                  PRESSURE_CONNECTOR + currentPressureIn + PRESSURE_UNITS_IN +
                  PRESSURE_ALT_CONNECTOR  + currentPressureMb + PRESSURE_UNITS_MB +
                  trendMessage;
              intent.emit(":tell", speechOutput);
              //this.emit(':tellWithCard', speechOutput, SKILL_NAME, currentPressure);
              //intent.emit(":tell", "test complete");
            });
          }

          break;
        case 204:
          // This likely means that the user didn't have their address set via the companion app.
          console.log("Successfully requested from the device address API, but no address was returned.");
          this.emit(":tell", NO_ADDRESS);
          break;
        case 403:
          console.log("The consent token we had wasn't authorized to access the user's address.");
          this.emit(":tellWithPermissionCard", NOTIFY_MISSING_PERMISSIONS, PERMISSIONS);
          break;
        default:
          this.emit(":ask", LOCATION_FAILURE, LOCATION_FAILURE);
      }

      console.info("Ending getAddressHandler()");
    });

    deviceAddressRequest.catch((error) => {
      this.emit(":tell", ERROR);
      console.error(error);
      console.info("Ending getAddressHandler()");
    });
  }
};
