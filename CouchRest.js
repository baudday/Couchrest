var CouchRest = function(config) {
    var _this = this;
    this.config = config;
    this.offline = true; // Init as false just in case
};

/*
* From the Pouch Documentation:
*
* opts.include_docs: Include the document in each row in the doc field
* opts.conflicts: Include conflicts in the _conflicts field of a doc
* options.startkey & options.endkey: Get documents with keys in a certain range
* options.descending: Reverse the order of the output table
* options.keys: array of keys you want to get
* options.attachments: Include attachment data
*/
CouchRest.prototype.fetch = function(collection, opts, callback) {
    var _this = this;
    var local = false;
    var db = new Pouch(collection);
    var remote = this.config.couchUrl + collection;

    if(typeof opts === 'function') {
        callback = opts;
        opts = {};
    }

    if(opts.hasOwnProperty('local')) {
        local = true;
        delete opts.local;
    }

    // Just fetch from the pouch if we're offline
    if(this.offline || local) {
        db.allDocs(opts, callback);
    } else { // Get the freshest data if we're online
        db.replicate.from(remote, {
            complete: function() {
                db.allDocs(opts, callback);
            }
        });
    }
};

CouchRest.prototype.get = function(collection, docid, opts, callback) {
    var _this = this;
    var db = new Pouch(collection);
    var remote = this.config.couchUrl + collection;

    if(typeof opts === 'function') {
        callback = opts;
        opts = {};
    }

    if(this.offline) {
        db.get(docid, opts, callback);
    } else {
        db.replicate.from(remote, {
            complete: function() {
                db.get(docid, opts, callback);
            }
        });
    }
};

CouchRest.prototype.save = function(collection, doc, opts, callback) {
    // Just a wrapper. We're always saving to 
    // the pouch and replicating to the server
    var _this = this;
    var db = new Pouch(collection);
    var remote = this.config.couchUrl + collection;
    var method = doc.hasOwnProperty('_id') ? 'put' : 'post';

    if(typeof opts === 'function') {
        callback = opts;
        opts = {};
    }

    db[method](doc, opts, function(err, res) {
        if(!_this.offline) {
            db.replicate.to(remote);
        }

        callback(err, res);
    });
};

CouchRest.prototype.bulkSave = function(collection, docs, opts, callback) {
    var _this = this;
    var db = new Pouch(collection);

    if(typeof opts === 'function') {
        callback = opts;
        opts = {};
    }

    db.bulkDocs(docs, opts, callback);
};

CouchRest.prototype.replicate = function(source, target, opts) {
    // Also just a wrapper. Leaving it open for
    // future customization is necessary
    var opts = opts || {};

    Pouch.replicate(source, target, opts);
};

CouchRest.prototype.replicateFrom = function(collection, opts) {
    var remote = this.config.couchUrl + collection;
    var db = new Pouch(collection);

    db.replicate.from(remote, opts);
};

CouchRest.prototype.status = function(callback) {
    var _this = this;
    jQuery.ajax({
        url: _this.config.apiUrl + '/status',
        timeout: 1000,
        complete: function(res) {
            _this.offline = res.status === 200 ? false : true;
            console.log(
                "CouchRest Status:",
                _this.offline === false ? "online" : "offline"
            );

            if(callback) callback(_this.offline);
        }
    });
};

CouchRest.prototype.syncToRemote = function(omit) {
    var _this = this;
    if(!omit) omit = new Array();

    PouchDB.enableAllDbs = true;
    Pouch.allDbs(function(err, response) {
        jQuery.each(response, function(index, collection) {
            // omit the collection
            if(omit.indexOf(collection) > -1) return true;

            var db = new Pouch(collection);
            var remote = _this.config.couchUrl + collection;

            db.replicate.to(remote);
        });
    });
};

// All fields required
CouchRest.prototype.query = function(collection, query, rep, callback) {
    var local = false;
    var db = new Pouch(collection);
    var remote = this.config.couchUrl + collection;

    if(!query.opts) query.opts = {};
    if(typeof rep === 'function') callback = rep;

    if(query.opts.hasOwnProperty('local')) {
        local = true;
        delete query.opts.local;
    }

    if(this.offline || local || typeof rep === 'function') {
        // Query pouch
        db.query(query.fun, query.opts, callback);
    } else {
        // Replicate from server
        db.replicate.from(remote, {
            filter: rep.opts.filter,

            complete: (
                (rep.opts.complete) ?
                    rep.opts.complete :
                    function() {
                        // Return results
                        db.query(query.fun, query.opts, callback);
                    }
            )
        });
    }
};

define('CouchRest', [], function() { return CouchRest });
