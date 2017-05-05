'use strict'

const expect = require('chai').expect;
const axios = require('axios');
//const cookie = require('cookie-machine');
const kf = require('kafka-node');
const Promise = require('bluebird');
var validator = require('validator');

// Self test needs the express server. It will verify both axios and chai work
// as expected.
const isSelfTesting = process.env.NODE_ENV === 'selftest';
const isDebugging = process.env.NODE_ENV_DEBUG === 'true';

const log = isDebugging ? msg => console.log(debugMark + msg) : () => {};
const debugMark = " => ";

if (isSelfTesting) {
  // TODO: make sure this token is invalid.
  const FOO_INVALID_TOKEN = 'foo-invalid-token-tests';

  describe('SelfTest', () => {
    let serverResHeader = '',
      serverResToken = '';

    before(() => {
      // Embed the token for all HTTP request.
      axios.interceptors.request.use(function(config) {
        const token = FOO_INVALID_TOKEN; // cookie.get(__TOKEN_KEY__);

        if (token != null) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
      }, function(errEmbedToken) {
        return Promise.reject(errEmbedToken);
      });

      // Self tests.
      return axios.get('http://localhost/echo', {
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
        expect(serverResToken).to.equal(`Bearer ${FOO_INVALID_TOKEN}`);
        done();
      });
    });

    after(() => {

    });
  });
} else {
  // Real tests.
  console.log(debugMark + 'Starting tests... (for invalidTokenValidUrl)');
  const FOO_INVALID_TOKEN = 'footoken-tests';

  //--------------------------------------------------
  // HTTP-Handler: HTTP response + token_request
  //--------------------------------------------------
  let token_request = null;

  describe('HTTP-Handler', () => {
    // TODO: make sure this url is valid.
    const VALID_GET_REQ_URL = 'resources/testdata/test/123';

    let url = 'http://proxy/' + VALID_GET_REQ_URL;

    // Get the Kafka consumer ready.
    const consumer = new kf.ConsumerGroup({
      host: 'zookeeper:2181',
      groupId: 'consume-group-tester-http-handler-token-request',
      protocol: ['roundrobin'],
      fromOffset: 'earliest', // or latest
      sessionTimeout: 15000,
    }, ['token_request']);

    // 1. Hit the server with a URL (and a token) and check corresponding Kafka
    // messages.
    let token_request_str = null;

    before((done) => {
      consumer.on('message', msg => {
        log('Kafka consumer message = ' + JSON.stringify(msg) +
          ', key = ' + msg.key.toString());
        token_request_str = msg.value;
        token_request = JSON.parse(token_request_str);

        // To make sure only one message is consumed.
        consumer.close();

        done();
      });

      // Embed the token for all HTTP request.
      axios.interceptors.request.use(function(config) {
        const token = FOO_INVALID_TOKEN; // cookie.get(__TOKEN_KEY__);

        if (token != null) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
      }, function(errEmbedToken) {
        return Promise.reject(errEmbedToken);
      });

      // Hit the server when everything is set up correctly.
      axios.get(url)
        .then(function(response) {
          log('HTTP GET Response: ' + response);
        })
        .catch(function(error) {
          log('HTTP GET Error: ' + error);
        });
    });

    // Tests for task 1.
    describe('token_request Kafka msg', () => {
      it('should be a non-empty string', () => {
        expect(token_request_str).to.be.a('String').that.is.not.empty;
      });
      it('should include the correct token', () => {
        expect(token_request_str).to.contain('token');
        expect(token_request.token).to.equal(`Bearer ${FOO_INVALID_TOKEN}`);
      });
      it('should have an integer resp_partition', () => {
        expect(token_request_str).to.contain('resp_partition');
        expect(token_request.resp_partition).to.be.a('number');
      });
      it('should have a valid UUID connection id string', () => {
        expect(token_request_str).to.contain('connection_id');
        expect(token_request.connection_id).to.be.a('String');
        expect(validator.isUUID(token_request.connection_id)).to.be.true;
      });
    });

    after(() => {

    });
  });

  //--------------------------------------------------
  // Token-Lookup:  http-response - token
  //--------------------------------------------------
  describe('Token-Lookup', () => {
    // Get the Kafka consumer ready.
    const consumer = new kf.ConsumerGroup({
      host: 'zookeeper:2181',
      groupId: 'consume-group-tester-token-lookup-http-response',
      protocol: ['roundrobin'],
      fromOffset: 'earliest', // or latest
      sessionTimeout: 15000,
    }, ['http_response']);

    // 2. Monitor and check the token message in the http-response.
    let http_response_str = null,
      http_response = null,
      doc = null;

    before((done) => {
      consumer.on('message', msg => {
        log('Kafka consumer message = ' + JSON.stringify(msg) +
          ', key = ' + msg.key.toString());
        http_response_str = msg.value;
        http_response = JSON.parse(http_response_str);
        doc = http_response.doc;

        // To make sure only one message is consumed.
        consumer.close();

        done();
      });
    });

    // Tests for task 2.
    describe('http_response_str Kafka msg', () => {
      it('should be a non-empty string', () => {
        expect(http_response_str).to.be.a('String');
        expect(http_response_str).to.not.be.empty;;
      });
      it('should include the correct token', () => {
        expect(http_response_str).to.contain('token');
        expect(http_response.token).to.equal(`Bearer ${FOO_INVALID_TOKEN}`);
      });
      it('should have the correct resp_partition', () => {
        expect(http_response_str).to.contain('resp_partition');
        expect(http_response.resp_partition)
          .to.equal(token_request.resp_partition);
      });
      it('should have the correct UUID connection id', () => {
        expect(http_response_str).to.contain('connection_id');
        expect(http_response.connection_id)
          .to.equal(token_request.connection_id);
      });
      it('should have a "doc" field', () => {
        expect(http_response_str).to.contain('doc');
      });
    });

    // More for task 2.
    describe('"doc" from the http_response_str Kafka msg', () => {
      it('should have a null userid', () => {
        expect(doc).to.have.property('userid')
          .that.is.null;
      });
      it('should have a null clientid', () => {
        expect(doc).to.have.property('clientid')
          .that.is.null;
      });
      it('should have a null bookmarksid', () => {
        expect(doc).to.have.property('scope')
          .that.is.null;
      });
      it('should have an empty scope array', () => {
        expect(doc).to.have.property('scope')
          .that.is.an('array')
          // Because the token is invalid, the scope array should be empty.
          .that.is.empty;
      });
    });

    after(() => {

    });
  });
}
