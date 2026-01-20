const cron = require('node-cron');
const Task = require('../model/Task');
const Agent = require('../model/Agent');
const {sendOverdueEmail} = require("../util/sendEmail")
const Notification = require("../model/Notification"); 

function startOverDueTaskJob() {
cron.schedule('0 0 * * *', async () => {  // Runs at midnight daily
  console.log("Checking for overdue tasks...");

  const now = new Date();

  const overdueTasks = await Task.find({
    taskSubmissionDate: { $lt: now },
    status: "assigned"
  });

  for (const task of overdueTasks) {
    task.status = "over-due";
    await task.save();

    const agent = await Agent.findById(task.agentId);
    if (!agent) continue;

     // Send email
    await sendOverdueEmail(agent.email, task);

    // In-app notification
    await Notification.create({
      recipientRole:"Agent",
      recipientId:agent._id,
      type:"message",
      title:"Overdue task",
      body:`Your assigned task is overdue. Submit it immediately to avoid a penalty.`,
    })

  }

   console.log("Overdue tasks completely checked");
});
}

module.exports = { startOverDueTaskJob}