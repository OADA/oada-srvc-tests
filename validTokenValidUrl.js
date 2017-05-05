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

// Only run the test if self test is not required.
if (!isSelfTesting) {
  // Real tests.
  console.log(debugMark + 'Starting tests... (for validTokenValidUrl)');

  // TODO: make sure this token is valid.
  const FOO_VALID_TOKEN = 'foo-valid-token-tests';

  //--------------------------------------------------
  // HTTP-Handler: HTTP response + token_request
  //--------------------------------------------------
  let token_request = null;
  let http_get_response = null;

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
        const token = FOO_VALID_TOKEN; // cookie.get(__TOKEN_KEY__);

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
          http_get_response = response;
        })
        .catch(function(error) {
          log('HTTP GET Error: ' + error);
        });
    });

    // Tests for task 1.
    describe('token_request Kafka msg', () => {
      it('should be a non-empty string', () => {
        expect(token_request_str).to.be.a('String');
        expect(token_request_str).to.not.be.empty;;
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
          .that.is.not.empty;
      });
      it('should have a null clientid', () => {
        expect(doc).to.have.property('clientid')
          .that.is.not.empty;
      });
      it('should have a null bookmarksid', () => {
        expect(doc).to.have.property('bookmarksid')
          .that.is.not.empty;
      });
      it('should have an empty scope array', () => {
        expect(doc).to.have.property('scope')
          .that.is.an('array'); // Can be either empty or not.
      });
    });

    after(() => {

    });
  });

  //--------------------------------------------------
  // HTTP-Handler (after msg token): graph_request
  //--------------------------------------------------
  describe('HTTP-Handler (after msg token)', () => {
    // Get the Kafka consumer ready.
    const consumer = new kf.ConsumerGroup({
      host: 'zookeeper:2181',
      groupId: 'consume-group-tester-http-handler-graph-request',
      protocol: ['roundrobin'],
      fromOffset: 'earliest', // or latest
      sessionTimeout: 15000,
    }, ['graph_request']);

    // 3. HTTP handler should issue a graph request into Kafka.
    let graph_request_str = null,
      graph_request = null;

    before((done) => {
      consumer.on('message', msg => {
        log('Kafka consumer message = ' + JSON.stringify(msg) +
          ', key = ' + msg.key.toString());
        graph_request_str = msg.value;
        graph_request = JSON.parse(graph_request_str);

        // To make sure only one message is consumed.
        consumer.close();

        done();
      });

    });

    // Tests for task 3.
    describe('graph_request Kafka msg', () => {
      it('should be a non-empty string', () => {
        expect(graph_request_str).to.be.a('String').that.is.not.empty;
      });
      it('should have the correct resp_partition', () => {
        expect(graph_request).to.have.property('resp_partition')
          .that.is.equal.to(token_request.resp_partition);
      });
      it('should have the correct connection UUID', () => {
        expect(graph_request).to.have.property('connection_id')
          .that.is.equal.to(token_request.connection_id);
      });
      it('should have the correct URL', () => {
        expect(graph_request).to.have.property('url')
          .that.is.equal.to(VALID_GET_REQ_URL);
      });
    });

    after(() => {

    });
  });

  //--------------------------------------------------
  // Graph-Lookup: http-response - graph
  //--------------------------------------------------
  describe('Graph-Lookup', () => {
    // Get the Kafka consumer ready.
    const consumer = new kf.ConsumerGroup({
      host: 'zookeeper:2181',
      groupId: 'consume-group-tester-graph-lookup-http-response',
      protocol: ['roundrobin'],
      fromOffset: 'earliest', // or latest
      sessionTimeout: 15000,
    }, ['http_response']);

    // 4. Graph-Lookup should issue a graph HTTP response into Kafka.
    let graph_response_str = null,
      graph_response = null;

    let counter = 0;
    before((done) => {
      consumer.on('message', msg => {
        log('Kafka consumer message = ' + JSON.stringify(msg) +
          ', key = ' + msg.key.toString());
        counter++;
        // Discard the token HTTP response.
        if (counter==2) {
          graph_response_str = msg.value;
          graph_response = JSON.parse(graph_response_str);

          // To make sure only one message is consumed.
          consumer.close();

          done();
        }
      });

    });

    // Tests for task 4.
    describe('graph_response Kafka msg', () => {
      it('should be a non-empty string', () => {
        expect(graph_response_str).to.be.a('String').that.is.not.empty;
      });
      it('should have the correct resp_partition', () => {
        expect(graph_request).to.have.property('resp_partition')
          .that.is.equal.to(token_request.resp_partition);
      });
      it('should have the correct connection UUID', () => {
        expect(graph_request).to.have.property('connection_id')
          .that.is.equal.to(token_request.connection_id);
      });
      it('should have the correct URL', () => {
        expect(graph_request).to.have.property('url')
          .that.is.equal.to(VALID_GET_REQ_URL);
      });

      // Because the URL is valid, some things below should be valid (non-empty).
      it('should have a non-empty resourceid', () => {
        expect(graph_request).to.have.property('resourceid')
          .that.is.a('String').that.is.not.empty;
      });
      it('should have a non-empty path_leftover', () => {
        expect(graph_request).to.have.property('path_leftover')
          .that.is.a('String').that.is.not.empty;
      });

      it('should have a metaid field (either empty or not)', () => {
        expect(graph_request).to.have.property('metaid');
      });
    });

    after(() => {

    });
  });

}
