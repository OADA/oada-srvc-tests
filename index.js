'use strict'

const expect = require('chai').expect;
const axios = require('axios');
//const cookie = require('cookie-machine');
const kf = require('kafka-node');
const Promise = require('bluebird');

// Self test needs the express server. It will verify both axios and chai work
// as expected.
const isSelfTesting = process.env.NODE_ENV === 'selftest';

if (isSelfTesting) {
  const FOO_TOKEN = 'footoken-tests';

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
  console.log(' => Starting tests...');

  //--------------------------------------------------
  // HTTP-Handler
  //--------------------------------------------------
  describe('HTTP-Handler', () => {
    const FOO_TOKEN = 'footoken-tests';
    const GET_REQ_URL = 'resources/testdata/test/123';

    let url = 'http://http-handler/' + GET_REQ_URL;

    // Get the Kafka consumer ready.
    const consumer = new kf.ConsumerGroup({
      host: 'zookeeper:2181',
      groupId: 'consume-group-tester-http-handler-token-request',
      protocol: [ 'roundrobin' ],
      fromOffset: 'earliest', // or latest
      sessionTimeout: 15000,
    }, [ 'token_request', 'url_request' ]);

    // 1. Hit the server with a URL (and a token) and check corresponding Kafka
    // messages.
    let token_request_str = '',
      url_request_str = '';

    before(() => {
      consumer.on('message', msg => {
        console.log('received consumer message = ', msg, ', key = ', msg.key.toString());
      });

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

      // Hit the server when everything is set up correctly.
      return axios.get(url)
        .then(function(response) {
          console.log('HTTP GET Response: ' + response);
        })
        .catch(function(error) {
          console.log('HTTP GET Error: ' + error);
        });
    });

    // Tests for task 1.
    describe('token_request', () => {
      it('should be an echo server', done => {
        // expect(serverResHeader).to.equal('Echo');
        done();
      });
      it('should respond with correct token', done => {
        // expect(serverResToken).to.equal(`Bearer ${FOO_TOKEN}`);
        done();
      });
    });
    //
    // describe('token_request', () => {
    //   it('should be an echo server', done => {
    //     expect(serverResHeader).to.equal('Echo');
    //     done();
    //   });
    //   it('should respond with correct token', done => {
    //     expect(serverResToken).to.equal(`Bearer ${FOO_TOKEN}`);
    //     done();
    //   });
    // });

    after(() => {
      consumer.stop();
    });
  });
}
