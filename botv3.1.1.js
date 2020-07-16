//To-Do List Bot v3.1.1
//all lists/times in UTC-4:00

require("dotenv").config();

//const keepAlive = require('./server');

const Discord = require("discord.js");
const client = new Discord.Client({disableEveryone: false});

const sqlite3 = require("sqlite3");
var db;
var curChanId = "_0";

const helpText = "`!todo add <due date> ; <task>` - Add a new task to the to-do list.\n" +
                 "`!todo list` - Display the current to-do list.\n" +
                 "`!todo done <task>` - Mark a task from the to-do list as done, and move it to the archive.\n" +
                 "`!todo delete <task>`, `!todo remove <task>` - Delete a task from the to-do list without archiving it.\n" +
                 "`!todo archive` - Display the archive of tasks.\n" +
                 "`!todo archivechannel` - Find out the archive channel for the current channel's list.\n" +
                 "`!todo setarchivechannel <#channel>` - Set a new archive channel for the current channel. (admin only)\n";
const doneText = "Are you sure you want to mark this task as done and archive it?";
const deleteText = "Are you sure you want to DELETE this task without archiving it?";

const remindTime = 60;
const snoozeTime = 86400;
const warningTime = 86400;
var names = {};

const filter = (react, user) => {
  return user.id != client.user.id && (react.emoji.name == "☑️" || react.emoji.name == "❌")
}

client.on("ready", () => {
	//keepAlive();
  console.log(`Logged in as ${client.user.tag}!`);
  db = new sqlite3.Database("./todo.db", (err) => {
		if(err){
      return console.error(err.message);
    }
    console.log("Connected to database!");
    db.run(`CREATE TABLE IF NOT EXISTS pairs (todoChan TEXT UNIQUE NOT NULL, archiveChan TEXT UNIQUE NOT NULL)`, [], (err) => {
      if(err){
        return console.error(err.message);
      }
    });
	});
  client.user.setActivity("!todo help");
  iniNames();
  setInterval(() => {
    let curTime = Math.floor(new Date().getTime() / 1000);
    db.each(`SELECT todoChan FROM pairs`, [], (err, row) => {
      if(err){
        return console.error(err.message);
      }
      let chan = client.channels.cache.get(row.todoChan);
      if(chan){
        db.each(`SELECT date, item, snooze FROM todo_${chan.id} ORDER BY date`, [], (err, row) => {
          if(err){
            return console.error(err.message);
          }
          if(row.snooze == 0 && curTime >= row.date - warningTime && curTime <= row.date){
            let str = reminderPing(row.item);
            chan.send(`🔔 Hi ${str}just a friendly reminder that \`${row.item}\` will be due in ${timeAgoString(row.date - curTime)}. If you have already completed the task, then don't forget to mark it as done!`);
            db.run(`UPDATE todo_${chan.id} SET snooze = 1 WHERE item = ?`, [row.item], (err) => {
              if(err){
                return console.error(err.message);
              }
            });
          }
          else if(curTime >= row.date + row.snooze){
            let str = reminderPing(row.item);
            chan.send(`📢 Hi ${str}just a friendly reminder that \`${row.item}\` was due ${timeAgoString(curTime - row.date)} ago. If you have already completed the task, then don't forget to mark it as done!`);
            db.run(`UPDATE todo_${chan.id} SET snooze = ${curTime} + ${snoozeTime} - ${row.date} WHERE item = ?`, [row.item], (err) => {
              if(err){
                return console.error(err.message);
              }
            });
          }
        });
      }
    });
  }, remindTime * 1000);
});

client.on("message", (msg) => {
  if(msg.author.id != client.user.id && msg.content.startsWith("!todo ")){
    curChanId = msg.channel.id;
    let command = msg.content.slice(6);
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS todo_${curChanId} (date INTEGER NOT NULL, item TEXT UNIQUE NOT NULL, snooze INTEGER DEFAULT 0)`, [], (err) => {
        if(err){
          return console.error(err.message);
        }
      });
      db.run(`CREATE TABLE IF NOT EXISTS archive_${curChanId} (date INTEGER NOT NULL, item TEXT NOT NULL)`, [], (err) => {
        if(err){
          return console.error(err.message);
        }
      });
      db.run(`INSERT INTO pairs (todoChan, archiveChan) VALUES (?, ?)`, [curChanId, curChanId], (err) => {
        if(err && !err.message.includes("UNIQUE constraint failed")){
          return console.log(err.message);
        }
      });
      db.get(`SELECT todoChan FROM pairs WHERE archiveChan = ?`, [curChanId], (err, row) => {
        if(err){
          return console.error(err.message);
        }

        if(row && row.todoChan != curChanId){     //this is an archive channel, and only an archive channel (not archive for itself)
          if(command.startsWith("help")){
            msg.channel.send(helpText);
          }

          else if(command.startsWith("archive") && !command.startsWith("archivechannel")){
            let str = "";
            db.get(`SELECT todoChan, archiveChan FROM pairs WHERE archiveChan = ?`, [curChanId], (err, row) => {
              if(err){
                return console.error(err.message);
              }
              db.serialize(() => {
                db.each(`SELECT datetime(date,'unixepoch','-4 hour') date, item FROM archive_${row.todoChan} ORDER BY date`, [], (err, row) => {
                  if(err){
                    return console.error(err.message);
                  }
                  if(row.date.substring(11, 19) == "00:00:00"){
                    str += row.date.substring(0, 10) + " — " + row.item + "\n";
                  }
                  else{
                    str += row.date.substring(0, 16) + " — " + row.item + "\n";
                  }
                });
                db.run("", [], () => {
                  if(str == ""){
                    msg.channel.send(`It looks like the archive for <#${row.todoChan}> is empty!`);
                  }
                  else{
                    msg.channel.send(`📁  **ARCHIVED FROM <#${row.todoChan}>**  📁\n${str}`);
                  }
                });
              });
            });
          }

          else if(command.startsWith("add ") || command.startsWith("list") || command.startsWith("done ") || command.startsWith("remove ") || command.startsWith("rm ") || command.startsWith("delete ") || command.startsWith("archivechannel") || command.startsWith("setarchivechannel ")){
            db.get(`SELECT todoChan FROM pairs WHERE archiveChan = ?`, [curChanId], (err, row) => {
              if(err){
                return console.error(err.message);
              }
              msg.channel.send(`Sorry, please go to another channel like <#${row.todoChan}> to use these commands!`);
            });
          }

          else{
            msg.react("❓");
          }
        }

        else{     //this is either (a) an archive channel for itself, or (b) a todo channel
          if(command.startsWith("help")){
            msg.channel.send(helpText);
          }

          else if(command.startsWith("add ")){
            if(!command.slice(4).includes(";")){
              msg.channel.send("Sorry, please check the format of your command and try again.");
              return;
            }
            let arr = command.slice(4).split(";", 2);
            let d = Date.parse(arr[0] + " UTC-4");
            if(isNaN(d)){
              msg.channel.send("Sorry, I don't understand your date format! Please try again.");
            }
            else{
              let it = arr[1].trim();
              if(it == ""){
                msg.react("😑");
              }
              else if(it.includes("@")){
                msg.channel.send("Sorry, but the task cannot include the @ symbol. Please try again using a different wording.");
              }
              else{
                db.get(`SELECT item FROM todo_${curChanId} WHERE item LIKE ? ORDER BY date`, [it], (err, row) => {
                  if(err){
                    return console.error(err.message);
                  }
                  if(row){
                    msg.react("⛔");
                  }
                  else{
                    db.run(`INSERT INTO todo_${curChanId} (date, item) VALUES (?, ?)`, [d/1000, it], (err) => {
                      if(err){
                        return console.log(err.message);
                      }
                      msg.react("🆗");
                    });
                  }
                });
              }
            }
          }

          else if(command.startsWith("list")){
            let str = "";
            db.serialize(() => {
              db.each(`SELECT datetime(date,'unixepoch','-4 hour') date, item FROM todo_${curChanId} ORDER BY date`, [], (err, row) => {
                if(err){
                  return console.error(err.message);
                }
                if(row.date.substring(11, 19) == "00:00:00"){
                  str += row.date.substring(0, 10) + " — " + row.item + "\n";
                }
                else{
                  str += row.date.substring(0, 16) + " — " + row.item + "\n";
                }
              });
              db.run("", [], () => {
                if(str == ""){
                  msg.channel.send("It looks like this to-do list is empty!");
                }
                else{
                  msg.channel.send(`✅  **TO-DO LIST**  ✅\n${str}`);
                }
              });
            });
          }

          else if(command.startsWith("archive") && !command.startsWith("archivechannel")){
            let str = "";
            db.serialize(() => {
              db.each(`SELECT datetime(date,'unixepoch','-4 hour') date, item FROM archive_${curChanId} ORDER BY date`, [], (err, row) => {
                if(err){
                  return console.error(err.message);
                }
                if(row.date.substring(11, 19) == "00:00:00"){
                  str += row.date.substring(0, 10) + " — " + row.item + "\n";
                }
                else{
                  str += row.date.substring(0, 16) + " — " + row.item + "\n";
                }
              });
              db.get(`SELECT todoChan, archiveChan FROM pairs WHERE todoChan = ?`, [curChanId], (err, row) => {
                if(str == ""){
                  client.channels.cache.get(row.archiveChan).send(`It looks like the archive for <#${row.todoChan}> is empty!`);
                }
                else{
                  client.channels.cache.get(row.archiveChan).send(`📁  **ARCHIVED FROM <#${row.todoChan}>**  📁\n${str}`);
                }
              });
            });
          }

          else if(command.startsWith("done ")){
            let it = "%" + command.slice(5).trim() + "%";
            db.get(`SELECT datetime(date,'unixepoch','-4 hour') date, item FROM todo_${curChanId} WHERE item LIKE ? ORDER BY date`, [it], (err, row) => {
              if(err){
                return console.error(err.message);
              }
              if(row){
                if(row.date.substring(11, 19) == "00:00:00"){
                  msg.channel.send(doneText + "\n`" + row.date.substring(0, 10) + " — " + row.item + "`");
                }
                else{
                  msg.channel.send(doneText + "\n`" + row.date.substring(0, 16) + " — " + row.item + "`");
                }
              }
              else{
                msg.react("🚫");
              }
            });
          }

          else if(command.startsWith("remove ") || command.startsWith("rm ") || command.startsWith("delete ")){
            let it = "";
            if(command.startsWith("remove ") || command.startsWith("delete ")){
              it = "%" + command.slice(7).trim() + "%";
            }
            else if(command.startsWith("rm ")){
              it = "%" + command.slice(3).trim() + "%";
            }
            db.get(`SELECT datetime(date,'unixepoch','-4 hour') date, item FROM todo_${curChanId} WHERE item LIKE ? ORDER BY date`, [it], (err, row) => {
              if(err){
                return console.error(err.message);
              }
              if(row){
                if(row.date.substring(11, 19) == "00:00:00"){
                  msg.channel.send(deleteText + "\n`" + row.date.substring(0, 10) + " — " + row.item + "`");
                }
                else{
                  msg.channel.send(deleteText + "\n`" + row.date.substring(0, 16) + " — " + row.item + "`");
                }
              }
              else{
                msg.react("🚫");
              }
            });
          }

          else if(command.startsWith("archivechannel")){
            db.get(`SELECT archiveChan FROM pairs WHERE todoChan = ?`, [curChanId], (err, row) => {
              if(err){
                return console.erroe(err.message);
              }
              msg.channel.send(`The archive channel for <#${curChanId}> is <#${row.archiveChan}>`);
            });
          }

          else if(command.startsWith("setarchivechannel ")){
            if(msg.member.hasPermission("ADMINISTRATOR")){
              let archiveChanId = command.slice(20, -1);
              if(!msg.guild.channels.cache.find(chan => chan.id == archiveChanId)){
                msg.react("⛔");
              }
              else{
                db.get(`SELECT archiveChan FROM pairs WHERE todoChan = ?`, [curChanId], (err, row) => {
                  if(err){
                    return console.error(err.message);
                  }
                  if(row && row.archiveChan == archiveChanId){
                    msg.react("🤔");
                  }
                  else{
                    db.get(`SELECT todoChan FROM pairs WHERE todoChan = ?`, [archiveChanId], (err, row) => {
                      if(err){
                        return console.error(err.message);
                      }
                      if(row){
                        if(row.todoChan == curChanId){
                          db.run(`UPDATE pairs SET archiveChan = ? WHERE todoChan = ?`, [archiveChanId, curChanId], (err) => {
                            if(err){
                              return console.error(err.message);
                            }
                            msg.react("🆗");
                          });
                        }
                        else{
                          msg.react("⛔");
                        }
                      }
                      else{
                        db.get(`SELECT archiveChan FROM pairs WHERE archiveChan = ?`, [archiveChanId], (err, row) => {
                          if(err){
                            return console.error(err.message);
                          }
                          if(row){
                            msg.react("⛔");
                          }
                          else{
                            db.run(`UPDATE pairs SET archiveChan = ? WHERE todoChan = ?`, [archiveChanId, curChanId], (err) => {
                              if(err){
                                return console.error(err.message);
                              }
                              msg.react("🆗");
                            });
                          }
                        });
                      }
                    });
                  }
                });
              }
            }
            else{
              msg.react("⛔");
            }
          }

          else{
            msg.react("❓");
          }
        }
      });
    });
  }

  else if(msg.author.id === client.user.id && msg.content.startsWith(doneText)){
    curChanId = msg.channel.id;
    msg.react("☑️")
      .then(() => msg.react("❌")
      .then(() => msg.awaitReactions(filter, {max: 1, time: 15000})
      .then((collected) => {
        let react = collected.first();
        if(collected.size == 0 || react.emoji.name === "❌"){
          msg.reactions.removeAll()
            .then(() => msg.react("🚫"));
        }
        else if(react.emoji.name === "☑️"){
          let arr = msg.content.slice(doneText.length + 2, -1).split(" — ");
          db.serialize(() => {
            db.get(`SELECT date, item FROM todo_${curChanId} WHERE item = ? ORDER BY date`, [arr[1]], (err, row) => {
              if(err){
                return console.error(err.message);
              }
              db.run(`INSERT INTO archive_${curChanId} (date, item) VALUES (?, ?)`, [row.date, row.item], (err) => {
                if(err){
                  return console.log(err.message);
                }
              });
            });
            db.run(`DELETE FROM todo_${curChanId} WHERE item = ?`, [arr[1]], (err) => {
              if(err){
                return console.log(err.message);
              }
              msg.reactions.removeAll()
                .then(() => msg.react("✅"));
            });
          });
        }
      })
    ));
  }

  else if(msg.author.id === client.user.id && msg.content.startsWith(deleteText)){
    curChanId = msg.channel.id;
    msg.react("☑️")
      .then(() => msg.react("❌")
      .then(() => msg.awaitReactions(filter, {max: 1, time: 15000})
      .then((collected) => {
        let react = collected.first();
        if(collected.size == 0 || react.emoji.name === "❌"){
          msg.reactions.removeAll()
            .then(() => msg.react("🚫"));
        }
        else if(react.emoji.name === "☑️"){
          let arr = msg.content.slice(deleteText.length + 2, -1).split(" — ")
          db.run(`DELETE FROM todo_${curChanId} WHERE item = ?`, [arr[1]], (err) => {
            if(err){
              return console.log(err.message);
            }
            msg.reactions.removeAll()
              .then(() => msg.react("🗑️"));
          });
        }
      })
    ));
  }

});

/////////////////////////////////////////

client.on("disconnect", () => {
  db.close((err) => {
		if(err){
			return console.error(err.message);
		}
		console.log("Closed database connection.\n");
	});
});

client.login(process.env.TOKEN);

/////////////////////////////////////////

function iniNames(){
  names["amy"] = process.env.AMYID;
  names["albert"] = process.env.ALBERTID;
  names["eddie"] = process.env.EDDIEID;
  names["ethan"] = process.env.ETHANID;
  names["jake"] = process.env.JAKEID;
  names["jerry"] = process.env.JERRYID;
  names["lucy"] = process.env.LUCYID;
  names["matthew"] = process.env.MATTHEWID;
  names["ryan"] = process.env.RYANID;
}

function reminderPing(str){
  let ret = "";
  for(let i in names){
    if(str.toLowerCase().includes(i)){
      ret += `<@${names[i]}>, `;
    }
  }
  if(ret == ""){
    return "@everyone, "
  }
  return ret;
}

function timeAgoString(t){      //convert t seconds into x days/hours/min/sec
  let d = Math.floor(t / 86400);
  t -= d * 86400;
  let h = Math.floor(t / 3600);
  t -= h * 3600;
  let m = Math.floor(t / 60);
  let s = t % 60;
  let ret = "";
  if(d != 0){
    ret += d + " day";
    if(d != 1){
      ret += "s";
    }
    ret += ", ";
  }
  if(h != 0){
    ret += h + " hour";
    if(h != 1){
      ret += "s";
    }
    ret += ", ";
  }
  if(m != 0){
    ret += m + " minute";
    if(m != 1){
      ret += "s";
    }
    ret += " ";
  }
  if(ret != ""){
    ret += "and "
  }
  ret += s + " second";
  if(s != 1){
    ret += "s";
  }
  return ret;
}
