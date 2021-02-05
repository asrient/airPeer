const run = require('./run.js');

test('Local text transfer', (done) => {
    run("Hi", "Hello", true, (res, msg) => {
        if (msg) done(msg)
        expect(res).toBe(true);
        done();
    })
});