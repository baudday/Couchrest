var CouchRest = function(config) {
    var _this = this;
    this.config = config;
    this.status();

    if(!this.offline) this.sync();
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
    var db = new Pouch(collection);
    var remote = this.config.couchUrl + collection;

    if(typeof opts === 'function') {
        callback = opts;
        opts = {};
    }

    // Just fetch from the pouch if we're offline
    if(this.offline) {
        db.allDocs(opts, callback);
    } else { // Get the freshest data if we're online
        db.replicate.from(remote, {
            complete: function() {
                db.allDocs(opts, callback);
            }
        });
    }
};

CouchRest.prototype.save = function(collection, doc, opts, callback) {
    // Just a wrapper. We're always saving to 
    // the couch and replicating to the server
    var _this = this;
    var db = new Pouch(collection);
    var remote = this.config.couchUrl + collection;

    if(typeof opts === 'function') {
        callback = opts;
        opts = {};
    }

    db.post(doc, opts, function(err, res) {
        if(!_this.offline) {
            db.replicate.to(remote);
        }

        callback(err, res);
    });
};

CouchRest.prototype.replicate = function(source, target, opts) {
    // Also just a wrapper. Leaving it open for
    // future customization is necessary
    var opts = opts || {};

    Pouch.replicate(source, target, opts);
};

CouchRest.prototype.status = function() {
    var _this = this;
    jQuery.ajax({
        url: _this.config.apiUrl + '/status',
        timeout: 1000,
        async: false,
        complete: function(res) {
            window.offline = _this.offline = res.status === 200 ? false : true;
            console.log(
                "Status:",
                window.offline === false ? "online" : "offline"
            );
        }
    });
};

CouchRest.prototype.sync = function() {
    var _this = this;

    Pouch.allDbs(function(err, response) {
        jQuery.each(response, function(index, collection) {
            var db = new Pouch(collection);
            var remote = this.config.couchUrl + collection;

            db.replicate.from(remote);
            db.replicate.to(remote);
        });
    });
};

// All fields required
CouchRest.prototype.query = function(collection, query, rep, callback) {
    var db = new Pouch(collection);
    var remote = this.config.couchUrl + collection;

    if(!query.opts) query.opts = {};

    if(this.offline) {
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
