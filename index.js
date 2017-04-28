'use strict'

const expect = require('chai').expect;
const axios = require('axios');
//const cookie = require('cookie-machine');

// Self test needs the express server. It will verify both axios and chai work
// as expected.
const isSelfTesting = process.env.NODE_ENV === 'selftest';

if (isSelfTesting) {
  const FOO_TOKEN = 'footoken';

  describe('SelfTest', () => {
    let serverResHeader = '',
      serverResToken = '';

    before(() => {
      // Embed the token for all HTTP request.
      axios.interceptors.request.use(function(config) {
        const token = FOO_TOKEN; // cookie.get(__TOKEN_KEY__);

        if (token != null) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
      }, function(errEmbedToken) {
        return Promise.reject(errEmbedToken);
      });

      // Self tests.
      axios.get('http://localhost/echo', {
          params: {
            ID: 12345
          }
        })
        .then(function(response) {
          serverResHeader = response.data.substr(0, 4);
          serverResToken = response.config.headers.Authorization;
        })
        .catch(function(error) {
          console.error('FAILED sending HTTP GET using axios!');
          console.error(error);
          return Promise.reject(error);
        });
    });

    //--------------------------------------------------
    // The tests!
    //--------------------------------------------------
    describe('SelfTestSever', () => {
      it('should be an echo server', done => {
        expect(serverResHeader).to.equal('Echo');
        done();
      });
      it('should respond with correct token', done => {
        expect(serverResToken).to.equal(`Bearer ${FOO_TOKEN}`);
        done();
      });
    });

    after(() => {

    });
  });
} else {
  // Real tests.

}
